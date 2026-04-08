const { StatusCodes } = require('http-status-codes');
const { errorResponse } = require('../utils/apiResponse');

const notFoundHandler = (req, res) => {
  return errorResponse(
    res,
    `Route not found: ${req.method} ${req.originalUrl}`,
    'NOT_FOUND',
    StatusCodes.NOT_FOUND
  );
};

module.exports = { notFoundHandler };
