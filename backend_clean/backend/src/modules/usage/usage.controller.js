const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const usageService = require('./usage.service');

const getSummary = asyncHandler(async (req, res) => {
  const data = await usageService.getUsageSummary(req.user.id);
  return successResponse(res, data);
});

module.exports = {
  getSummary,
};
