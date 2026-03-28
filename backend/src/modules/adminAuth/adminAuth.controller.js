const { prisma } = require('../../config/prisma');
const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const { verifyAccessToken } = require('../../utils/tokens');
const { AppError } = require('../../utils/appError');
const authService = require('../auth/auth.service');

const assertAdminRole = (role) => {
  if (role !== 'ADMIN') {
    throw new AppError('Invalid admin credentials', 401, 'INVALID_CREDENTIALS');
  }
};

const login = asyncHandler(async (req, res) => {
  const data = await authService.loginWithPassword({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  assertAdminRole(data.user?.role);
  return successResponse(res, data, 'Admin login successful');
});

const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refreshAccessToken(req.body.refreshToken);
  const payload = verifyAccessToken(data.accessToken);
  assertAdminRole(payload.role);

  return successResponse(res, data, 'Admin token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout({
    refreshToken: req.body.refreshToken,
    userId: req.user?.id,
  });

  return successResponse(res, { revoked: true }, 'Admin logged out successfully');
});

const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      profileImageUrl: true,
    },
  });

  if (!user) {
    throw new AppError('Admin not found', 404, 'ADMIN_NOT_FOUND');
  }

  return successResponse(res, user);
});

module.exports = {
  login,
  refresh,
  logout,
  me,
};
