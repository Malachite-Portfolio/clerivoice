const { asyncHandler } = require('../../utils/asyncHandler');
const { successResponse } = require('../../utils/apiResponse');
const supportService = require('./support.service');

const createTicket = asyncHandler(async (req, res) => {
  const data = await supportService.createTicket({
    userId: req.user.id,
    ...req.body,
  });

  return successResponse(res, data, 'Support ticket created');
});

module.exports = {
  createTicket,
};
