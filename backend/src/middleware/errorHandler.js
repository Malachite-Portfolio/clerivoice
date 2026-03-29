const { StatusCodes } = require('http-status-codes');
const { logger } = require('../config/logger');
const { errorResponse } = require('../utils/apiResponse');

const errorHandler = (error, req, res, _next) => {
  const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  const code = error.code || 'INTERNAL_SERVER_ERROR';
  const message = error.message || 'Something went wrong';
  const data = error.data || null;
  const requestMeta = {
    method: req?.method,
    path: req?.originalUrl || req?.url,
  };

  console.error('[EXPRESS_ERROR]', requestMeta, {
    code,
    statusCode,
    message,
  });

  if (statusCode >= 500) {
    logger.error(message, { code, stack: error.stack, ...requestMeta });
  } else {
    logger.warn(message, { code, data, ...requestMeta });
  }

  return errorResponse(res, message, code, statusCode, data);
};

module.exports = { errorHandler };
