const { StatusCodes } = require('http-status-codes');
const { prisma } = require('../config/prisma');
const { verifyAccessToken } = require('../utils/tokens');
const { AppError } = require('../utils/appError');

const authMiddleware = async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { listenerProfile: true, wallet: true },
    });

    if (!user) {
      throw new AppError('User not found', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
    }

    if (user.status === 'BLOCKED' || user.status === 'DELETED' || user.deletedAt) {
      throw new AppError('Account is unavailable', StatusCodes.FORBIDDEN, 'ACCOUNT_UNAVAILABLE');
    }

    req.user = {
      id: user.id,
      role: user.role,
      phone: user.phone,
      listenerProfile: user.listenerProfile,
      wallet: user.wallet,
    };

    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Invalid token', StatusCodes.UNAUTHORIZED, 'INVALID_TOKEN'));
    }
    return next(error);
  }
};

module.exports = { authMiddleware };
