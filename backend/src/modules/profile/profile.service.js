const { prisma } = require('../../config/prisma');
const fs = require('fs/promises');
const path = require('path');
const { env } = require('../../config/env');
const { AppError } = require('../../utils/appError');

const PROFILE_UPLOAD_DIRECTORY = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'uploads',
  'profile',
);

const USER_INCLUDE = {
  wallet: true,
  settings: true,
  listenerProfile: true,
  referralCode: true,
};

const getImageExtensionByMimeType = (mimeType = '') => {
  const normalizedMimeType = String(mimeType || '')
    .trim()
    .toLowerCase();

  if (normalizedMimeType === 'image/png') {
    return '.png';
  }

  if (normalizedMimeType === 'image/webp') {
    return '.webp';
  }

  return '.jpg';
};

const buildStableFallbackAvatarUrl = (user = {}) => {
  const seedSegments = [
    user?.id,
    user?.phone,
    user?.displayName,
    user?.role,
    'clarivoice-avatar-v1',
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const seed = seedSegments.length ? seedSegments.join(':') : 'clarivoice-avatar-v1:guest';
  return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${encodeURIComponent(
    seed,
  )}&radius=50&scale=95`;
};

const buildPublicProfileImageUrl = (relativePath, requestMeta = {}) => {
  const normalizedRelativePath = String(relativePath || '').trim();
  if (!normalizedRelativePath) {
    return '';
  }

  const configuredPublicBaseUrl = String(env.PROFILE_IMAGE_PUBLIC_BASE_URL || '').trim();
  if (configuredPublicBaseUrl) {
    return `${configuredPublicBaseUrl.replace(/\/+$/, '')}${normalizedRelativePath}`;
  }

  const requestHost = String(requestMeta?.host || '').trim();
  if (!requestHost) {
    return normalizedRelativePath;
  }

  const requestProtocol = String(requestMeta?.protocol || 'https').trim() || 'https';
  return `${requestProtocol}://${requestHost}${normalizedRelativePath}`;
};

const cleanupOldUploadedAvatar = async (profileImageUrl = '') => {
  const normalizedUrl = String(profileImageUrl || '').trim();
  if (!normalizedUrl) {
    return;
  }

  let uploadPathname = '';
  if (normalizedUrl.startsWith('/uploads/profile/')) {
    uploadPathname = normalizedUrl;
  } else {
    try {
      const parsedUrl = new URL(normalizedUrl);
      uploadPathname = parsedUrl.pathname || '';
    } catch (_error) {
      uploadPathname = '';
    }
  }

  if (!uploadPathname.startsWith('/uploads/profile/')) {
    return;
  }

  const fileName = path.basename(uploadPathname);
  if (!fileName) {
    return;
  }

  const absolutePath = path.join(PROFILE_UPLOAD_DIRECTORY, fileName);
  await fs.unlink(absolutePath).catch(() => {});
};

const hydrateFallbackAvatar = async (user) => {
  if (!user) {
    return user;
  }

  if (String(user?.profileImageUrl || '').trim()) {
    return user;
  }

  const fallbackAvatarUrl = buildStableFallbackAvatarUrl(user);

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { profileImageUrl: fallbackAvatarUrl },
      include: USER_INCLUDE,
    });
    console.log('[Profile] fallbackAvatarAssigned', {
      userId: user.id,
      profileImageUrl: fallbackAvatarUrl,
    });
    return updated;
  } catch (_error) {
    return {
      ...user,
      profileImageUrl: fallbackAvatarUrl,
    };
  }
};

const getMyProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: USER_INCLUDE,
  });

  return hydrateFallbackAvatar(user);
};

const updateMyProfile = async (userId, payload) => {
  return prisma.user.update({
    where: { id: userId },
    data: payload,
    include: USER_INCLUDE,
  });
};

const uploadProfileAvatar = async (userId, file, requestMeta = {}) => {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    include: USER_INCLUDE,
  });

  if (!currentUser) {
    throw new AppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
  }

  await fs.mkdir(PROFILE_UPLOAD_DIRECTORY, { recursive: true });

  const extension = getImageExtensionByMimeType(file?.mimetype);
  const fileName = `${userId}-${Date.now()}${extension}`;
  const absoluteFilePath = path.join(PROFILE_UPLOAD_DIRECTORY, fileName);
  await fs.writeFile(absoluteFilePath, file.buffer);

  const relativeFilePath = `/uploads/profile/${fileName}`;
  const publicImageUrl = buildPublicProfileImageUrl(relativeFilePath, requestMeta);

  await cleanupOldUploadedAvatar(currentUser?.profileImageUrl);
  console.log('[Profile] avatarFileStored', {
    userId,
    fileName,
    relativeFilePath,
  });

  return prisma.user.update({
    where: { id: userId },
    data: {
      profileImageUrl: publicImageUrl,
    },
    include: USER_INCLUDE,
  });
};

const softDeleteAccount = async (userId) => {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });

    await tx.authSession.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    await tx.listenerProfile.updateMany({
      where: { userId },
      data: {
        availability: 'OFFLINE',
        isEnabled: false,
      },
    });
  });
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  uploadProfileAvatar,
  softDeleteAccount,
};
