const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const settingsService = require('./settings.service');

const getSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.getSettings(req.user.id);
  return successResponse(res, data);
});

const patchSettings = asyncHandler(async (req, res) => {
  const data = await settingsService.updateSettings(req.user.id, req.body);
  return successResponse(res, data, 'Settings updated');
});

module.exports = {
  getSettings,
  patchSettings,
};
