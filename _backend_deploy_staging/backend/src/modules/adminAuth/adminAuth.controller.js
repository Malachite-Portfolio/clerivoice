const { prisma } = require('../../config/prisma');
const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const { verifyAccessToken } = require('../../utils/tokens');
const { AppError } = require('../../utils/appError');
const { logger } = require('../../config/logger');
const authService = require('../auth/auth.service');

const assertAdminRole = (role) => {
  if (role !== 'ADMIN') {
    throw new AppError('Invalid admin credentials', 401, 'INVALID_CREDENTIALS');
  }
};

const login = asyncHandler(async (req, res) => {
  const incomingKeys = Object.keys(req.body || {});
  logger.info('[AdminAuth] login request received', {
    keys: incomingKeys,
    ipAddress: req.ip,
  });

  try {
    const data = await authService.loginWithPassword({
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    assertAdminRole(data.user?.role);
    logger.info('[AdminAuth] login success', {
      userId: data.user?.id,
      role: data.user?.role,
      status: data.user?.status,
    });
    return successResponse(res, data, 'Admin login successful');
  } catch (error) {
    logger.warn('[AdminAuth] login failed', {
      code: error?.code || 'UNKNOWN',
      statusCode: error?.statusCode || error?.status || 500,
      message: error?.message || 'Login failed',
    });
    throw error;
  }
});

const refresh = asyncHandler(async (req, res) => {
  logger.info('[AdminAuth] refresh request received', {
    hasRefreshToken: Boolean(req.body?.refreshToken),
    ipAddress: req.ip,
  });
  const data = await authService.refreshAccessToken(req.body.refreshToken);
  const payload = verifyAccessToken(data.accessToken);
  assertAdminRole(payload.role);
  logger.info('[AdminAuth] refresh role check passed', {
    role: payload.role,
    userId: payload.sub,
  });

  return successResponse(res, data, 'Admin token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  logger.info('[AdminAuth] logout request received', {
    hasRefreshToken: Boolean(req.body?.refreshToken),
    userId: req.user?.id || null,
    ipAddress: req.ip,
  });
  await authService.logout({
    refreshToken: req.body.refreshToken,
    userId: req.user?.id,
  });

  return successResponse(res, { revoked: true }, 'Admin logged out successfully');
});

const me = asyncHandler(async (req, res) => {
  logger.info('[AdminAuth] me request received', {
    userId: req.user?.id || null,
    role: req.user?.role || null,
    ipAddress: req.ip,
  });
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

  logger.info('[AdminAuth] me lookup result', {
    found: Boolean(user),
    userId: user.id,
    role: user.role,
    status: user.status,
  });
  return successResponse(res, user);
});

module.exports = {
  login,
  refresh,
  logout,
  me,
};
