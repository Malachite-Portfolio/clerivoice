const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../utils/appError');

const allowRoles = (...roles) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED'));
  }

  if (!roles.includes(req.user.role)) {
    return next(new AppError('Forbidden', StatusCodes.FORBIDDEN, 'FORBIDDEN'));
  }

  return next();
};

module.exports = { allowRoles };
