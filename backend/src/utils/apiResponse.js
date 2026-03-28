const successResponse = (res, data = {}, message = 'OK', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const errorResponse = (res, message, code = 'BAD_REQUEST', statusCode = 400, data = null) => {
  return res.status(statusCode).json({
    success: false,
    code,
    message,
    data,
  });
};

module.exports = { successResponse, errorResponse };
