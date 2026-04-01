const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const { logger } = require('../../config/logger');
const authService = require('./auth.service');

const sendOtp = asyncHandler(async (req, res) => {
  logger.info('[Auth] sendOtp request received', {
    keys: Object.keys(req.body || {}),
    ipAddress: req.ip,
  });
  const data = await authService.sendOtp(req.body);
  return successResponse(res, data, 'OTP sent successfully');
});

const sendListenerOtp = asyncHandler(async (req, res) => {
  logger.info('[Auth] sendListenerOtp request received', {
    keys: Object.keys(req.body || {}),
    ipAddress: req.ip,
  });
  const data = await authService.sendListenerOtp(req.body);
  return successResponse(res, data, 'Listener OTP sent successfully');
});

const verifyOtp = asyncHandler(async (req, res) => {
  logger.info('[Auth] verifyOtp request received', {
    keys: Object.keys(req.body || {}),
    ipAddress: req.ip,
  });
  const data = await authService.verifyOtp({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'OTP verified successfully');
});

const verifyListenerOtp = asyncHandler(async (req, res) => {
  logger.info('[Auth] verifyListenerOtp request received', {
    keys: Object.keys(req.body || {}),
    ipAddress: req.ip,
  });
  const data = await authService.verifyListenerOtp({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'Listener OTP verified successfully');
});

const loginUser = asyncHandler(async (req, res) => {
  logger.info('[Auth] loginUser request received', {
    keys: Object.keys(req.body || {}),
    ipAddress: req.ip,
  });
  const data = await authService.loginUserWithOtp({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'User login successful');
});

const login = asyncHandler(async (req, res) => {
  logger.info('[Auth] login request received', {
    keys: Object.keys(req.body || {}),
    ipAddress: req.ip,
  });
  const data = await authService.loginWithPassword({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'Login successful');
});

const loginListener = asyncHandler(async (req, res) => {
  logger.info('[Auth] loginListener request received', {
    keys: Object.keys(req.body || {}),
    ipAddress: req.ip,
  });
  const data = await authService.loginListenerWithPassword({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'Listener login successful');
});

const refresh = asyncHandler(async (req, res) => {
  logger.info('[Auth] refresh request received', {
    hasRefreshToken: Boolean(req.body?.refreshToken),
    ipAddress: req.ip,
  });
  const data = await authService.refreshAccessToken(req.body.refreshToken);
  return successResponse(res, data, 'Token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  logger.info('[Auth] logout request received', {
    hasRefreshToken: Boolean(req.body?.refreshToken),
    userId: req.user?.id || null,
    ipAddress: req.ip,
  });
  await authService.logout({
    refreshToken: req.body.refreshToken,
    userId: req.user?.id,
  });

  return successResponse(res, {}, 'Logged out successfully');
});

module.exports = {
  sendOtp,
  sendListenerOtp,
  verifyOtp,
  verifyListenerOtp,
  loginUser,
  login,
  loginListener,
  refresh,
  logout,
};
