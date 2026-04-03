const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const profileService = require('./profile.service');

const getMe = asyncHandler(async (req, res) => {
  const data = await profileService.getMyProfile(req.user.id);
  return successResponse(res, data);
});

const patchMe = asyncHandler(async (req, res) => {
  const data = await profileService.updateMyProfile(req.user.id, req.body);
  return successResponse(res, data, 'Profile updated');
});

const uploadAvatar = asyncHandler(async (req, res) => {
  console.log('[Profile] avatarUploadStart', {
    userId: req?.user?.id || null,
    mimeType: req?.file?.mimetype || null,
    fileSize: Number(req?.file?.size || 0) || null,
  });

  const data = await profileService.uploadProfileAvatar(req.user.id, req.file, {
    protocol:
      req?.headers?.['x-forwarded-proto'] ||
      req?.protocol ||
      'https',
    host:
      req?.headers?.['x-forwarded-host'] ||
      req?.get('host') ||
      '',
  });

  console.log('[Profile] avatarUploadSuccess', {
    userId: req?.user?.id || null,
    profileImageUrl: data?.profileImageUrl || null,
  });

  return successResponse(res, data, 'Profile image updated');
});

const deleteMe = asyncHandler(async (req, res) => {
  await profileService.softDeleteAccount(req.user.id);
  return successResponse(res, {}, 'Account deleted successfully');
});

module.exports = {
  getMe,
  patchMe,
  uploadAvatar,
  deleteMe,
};
