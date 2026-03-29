const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const authService = require('./auth.service');

const sendOtp = asyncHandler(async (req, res) => {
  const data = await authService.sendOtp(req.body);
  return successResponse(res, data, 'OTP sent successfully');
});

const verifyOtp = asyncHandler(async (req, res) => {
  const data = await authService.verifyOtp({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'OTP verified successfully');
});

const loginUser = asyncHandler(async (req, res) => {
  const data = await authService.loginUserWithOtp({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'User login successful');
});

const login = asyncHandler(async (req, res) => {
  const data = await authService.loginWithPassword({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'Login successful');
});

const loginListener = asyncHandler(async (req, res) => {
  const data = await authService.loginListenerWithPassword({
    ...req.body,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  return successResponse(res, data, 'Listener login successful');
});

const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refreshAccessToken(req.body.refreshToken);
  return successResponse(res, data, 'Token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout({
    refreshToken: req.body.refreshToken,
    userId: req.user?.id,
  });

  return successResponse(res, {}, 'Logged out successfully');
});

module.exports = {
  sendOtp,
  verifyOtp,
  loginUser,
  login,
  loginListener,
  refresh,
  logout,
};
