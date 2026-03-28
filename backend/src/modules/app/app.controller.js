const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const appService = require('./app.service');

const getSidebar = asyncHandler(async (req, res) => {
  const data = await appService.getSidebarData(req.user.id);
  return successResponse(res, data);
});

module.exports = {
  getSidebar,
};
