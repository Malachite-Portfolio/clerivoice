const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');
const { env } = require('../config/env');
const { logger } = require('../config/logger');
const { signRefreshToken } = require('../utils/tokens');
const referralService = require('../modules/referral/referral.service');

const FIREBASE_LOGIN_TOKEN_EXPIRES_IN =
  process.env.FIREBASE_LOGIN_TOKEN_EXPIRES_IN || '7d';

const normalizePhone = (phone) => {
  const sanitized = String(phone || '')
    .replace(/[\s()-]/g, '')
    .trim();
  const digits = sanitized.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (sanitized.startsWith('+')) {
    return `+${digits}`;
  }

  return sanitized;
};

const normalizeRole = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'user') return 'USER';
  if (normalizedRole === 'listener') return 'LISTENER';
  return '';
};

const maskPhone = (phone) => {
  const value = String(phone || '').trim();
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
};

const parseDeviceInfo = (deviceInfo) => {
  if (!deviceInfo) {
    return {};
  }

  if (typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
    return deviceInfo;
  }

  if (typeof deviceInfo === 'string') {
    const trimmed = deviceInfo.trim();
    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return { raw: trimmed };
    } catch (_error) {
      return { raw: trimmed };
    }
  }

  return { raw: String(deviceInfo) };
};

const parseExpiryToDate = (expiresIn) => {
  const match = String(expiresIn || '').match(/^(\d+)([smhd])$/i);
  if (!match) {
    return dayjs().add(30, 'day').toDate();
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitMap = {
    s: 'second',
    m: 'minute',
    h: 'hour',
    d: 'day',
  };

  return dayjs().add(value, unitMap[unit]).toDate();
};

const assertAccountAllowed = (user) => {
  if (!user) {
    return;
  }

  if (user.status === 'BLOCKED' || user.status === 'DELETED' || user.deletedAt) {
    const error = new Error('Account is unavailable');
    error.statusCode = 403;
    error.code = 'ACCOUNT_UNAVAILABLE';
    throw error;
  }

  if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
    const error = new Error('Account is suspended');
    error.statusCode = 403;
    error.code = 'ACCOUNT_SUSPENDED';
    throw error;
  }
};

const sanitizeUserResponse = (user) => {
  const response = {
    id: user.id,
    phone: user.phone,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  };

  if (user.role === 'LISTENER' && user.listenerProfile) {
    response.listenerProfile = {
      availability: user.listenerProfile.availability,
      callRatePerMinute: user.listenerProfile.callRatePerMinute,
      chatRatePerMinute: user.listenerProfile.chatRatePerMinute,
      isEnabled: user.listenerProfile.isEnabled,
    };
  }

  return response;
};

const buildDefaultDisplayName = (role, normalizedPhone, displayName) => {
  const requestedDisplayName = String(displayName || '').trim();
  if (requestedDisplayName) {
    return requestedDisplayName;
  }

  const suffix = normalizedPhone.replace(/\D/g, '').slice(-4) || '0000';
  return role === 'LISTENER' ? `Listener-${suffix}` : `Anonymous-${suffix}`;
};

const issueAuthTokens = async ({
  user,
  firebaseUid,
  deviceId,
  deviceInfo,
  ipAddress,
  userAgent,
}) => {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      id: user.id,
      role: user.role,
      phone: user.phone,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: FIREBASE_LOGIN_TOKEN_EXPIRES_IN },
  );

  const sessionId = `sess_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  const refreshToken = signRefreshToken({
    sub: user.id,
    sid: sessionId,
    role: user.role,
  });
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshTokenHash,
      deviceId: deviceId || null,
      deviceInfo: {
        ...parseDeviceInfo(deviceInfo),
        firebaseUid,
      },
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      status: 'ACTIVE',
      expiresAt: parseExpiryToDate(env.JWT_REFRESH_EXPIRES_IN),
      lastUsedAt: new Date(),
    },
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
  };
};

const upsertUserRoleAccount = async ({ normalizedPhone, role, displayName }) => {
  const requestedDisplayName = String(displayName || '').trim();
  const createDisplayName = buildDefaultDisplayName(
    role,
    normalizedPhone,
    requestedDisplayName,
  );

  const throwRoleMismatch = () => {
    const roleMismatchError = new Error('Account role mismatch for this app');
    roleMismatchError.statusCode = 403;
    roleMismatchError.code = 'ACCOUNT_ROLE_MISMATCH';
    throw roleMismatchError;
  };

  const findByPhone = () =>
    prisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        listenerProfile: true,
      },
    });

  let user = await findByPhone();

  assertAccountAllowed(user);

  if (user && user.role !== role) {
    throwRoleMismatch();
  }

  if (!user && role === 'USER') {
    try {
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          displayName: createDisplayName,
          role,
          status: 'ACTIVE',
          isPhoneVerified: true,
        },
        include: {
          listenerProfile: true,
        },
      });
    } catch (error) {
      if (error?.code !== 'P2002') {
        throw error;
      }

      user = await findByPhone();

      assertAccountAllowed(user);
      if (!user || user.role !== role) {
        throwRoleMismatch();
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          isPhoneVerified: true,
          ...(requestedDisplayName ? { displayName: requestedDisplayName } : {}),
        },
        include: {
          listenerProfile: true,
        },
      });
    }
  }

  if (!user && role === 'LISTENER') {
    try {
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          displayName: createDisplayName,
          role,
          status: 'ACTIVE',
          isPhoneVerified: true,
        },
        include: {
          listenerProfile: true,
        },
      });
    } catch (error) {
      if (error?.code !== 'P2002') {
        throw error;
      }

      user = await findByPhone();

      assertAccountAllowed(user);
      if (!user || user.role !== role) {
        throwRoleMismatch();
      }
    }
  }

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        isPhoneVerified: true,
        ...(requestedDisplayName ? { displayName: requestedDisplayName } : {}),
      },
      include: {
        listenerProfile: true,
      },
    });
  }

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      currency: 'INR',
    },
  });

  if (role === 'USER') {
    await prisma.userSetting.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
      },
    });
    await referralService.ensureReferralCode(user.id);
  }

  if (role === 'LISTENER') {
    await prisma.listenerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        bio: 'Listener profile',
        rating: 0,
        experienceYears: 0,
        languages: ['English'],
        category: 'Emotional Support',
        callRatePerMinute: 15,
        chatRatePerMinute: 10,
        availability: 'OFFLINE',
        isEnabled: true,
      },
    });
  }

  // Schema has no firebaseUid column on User/ListenerProfile.
  // firebaseUid is persisted in authSession.deviceInfo via issueAuthTokens.
  const refreshedUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      listenerProfile: true,
    },
  });

  assertAccountAllowed(refreshedUser);

  if (refreshedUser.role === 'LISTENER' && refreshedUser.listenerProfile?.isEnabled === false) {
    const listenerDisabledError = new Error('Listener profile is unavailable');
    listenerDisabledError.statusCode = 403;
    listenerDisabledError.code = 'LISTENER_PROFILE_UNAVAILABLE';
    throw listenerDisabledError;
  }

  return refreshedUser;
};

const firebaseLogin = async (req, res) => {
  const normalizedPhone = normalizePhone(req.body?.phone);
  const normalizedFirebaseUid = String(req.body?.firebaseUid || '').trim();
  const role = normalizeRole(req.body?.role);
  const displayName = String(req.body?.displayName || '').trim();
  const deviceId = String(req.body?.deviceId || '').trim() || null;
  const deviceInfo = req.body?.deviceInfo;

  if (!normalizedPhone || !normalizedFirebaseUid || !role) {
    return res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      message: 'phone, firebaseUid, and role are required',
    });
  }

  try {
    logger.info('[AuthFirebase] firebase-login request received', {
      phone: maskPhone(normalizedPhone),
      role,
      hasDisplayName: Boolean(displayName),
      hasDeviceId: Boolean(deviceId),
      hasDeviceInfo: Boolean(deviceInfo),
    });

    const user = await upsertUserRoleAccount({
      normalizedPhone,
      role,
      displayName,
    });

    const tokens = await issueAuthTokens({
      user,
      firebaseUid: normalizedFirebaseUid,
      deviceId,
      deviceInfo,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(200).json({
      success: true,
      message: 'Firebase login successful',
      token: tokens.token,
      user: sanitizeUserResponse(user),
      data: {
        token: tokens.token,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: sanitizeUserResponse(user),
      },
    });
  } catch (error) {
    console.error('[AuthFirebase] firebase-login failed', {
      phone: maskPhone(normalizedPhone),
      role,
      statusCode: Number(error?.statusCode || 500),
      code: String(error?.code || 'FIREBASE_LOGIN_FAILED'),
      message: String(error?.message || 'Failed to login with Firebase'),
      stack: error?.stack || null,
    });

    const statusCode = Number(error?.statusCode || 500);
    const code = String(error?.code || (statusCode >= 500 ? 'FIREBASE_LOGIN_FAILED' : 'BAD_REQUEST'));
    const message = String(error?.message || 'Failed to login with Firebase');

    logger.error('[AuthFirebase] firebase-login failed', {
      phone: maskPhone(normalizedPhone),
      role,
      statusCode,
      code,
      message,
      stack: statusCode >= 500 ? error?.stack : undefined,
    });

    return res.status(statusCode).json({
      success: false,
      code,
      message,
    });
  }
};

module.exports = {
  firebaseLogin,
};
