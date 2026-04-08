class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', data = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
    this.isOperational = true;
  }
}

module.exports = { AppError };
