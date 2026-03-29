const { StatusCodes } = require('http-status-codes');
const { logger } = require('../config/logger');
const { errorResponse } = require('../utils/apiResponse');

const errorHandler = (error, req, res, _next) => {
  const parseError =
    error?.type === 'entity.parse.failed' || error instanceof SyntaxError;
  const statusCode =
    error.statusCode ||
    error.status ||
    (parseError ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR);
  const code =
    error.code ||
    (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  const message =
    parseError && !error?.message
      ? 'Invalid JSON payload'
      : error.message || 'Something went wrong';
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
