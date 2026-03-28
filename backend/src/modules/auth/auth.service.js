const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const { prisma } = require('../../config/prisma');
const { env } = require('../../config/env');
const { AppError } = require('../../utils/appError');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../utils/tokens');
const { buildReferralCode } = require('../../utils/referralCode');

const parseExpiryToDate = (expiresIn) => {
  const match = String(expiresIn).match(/^(\d+)([smhd])$/i);
  if (!match) {
    return dayjs().add(30, 'day').toDate();
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  const unitMap = {
    s: 'second',
    m: 'minute',
    h: 'hour',
    d: 'day',
  };

  return dayjs().add(value, unitMap[unit]).toDate();
};

const sanitizePhone = (phone) => phone.replace(/\s+/g, '');
const isDemoPhone = (phone) =>
  sanitizePhone(phone) === sanitizePhone(env.DEMO_LOGIN_PHONE);
const isDemoOtp = (otp) => String(otp) === String(env.DEMO_LOGIN_OTP);

const buildDemoAuthResponse = ({ phone }) => {
  const normalizedPhone = sanitizePhone(phone);
  const demoUser = {
    id: `demo_${normalizedPhone.replace('+', '')}`,
    role: 'USER',
    phone: normalizedPhone,
    displayName: `Anonymous-${normalizedPhone.slice(-4)}`,
    status: 'ACTIVE',
  };

  const accessToken = signAccessToken({
    sub: demoUser.id,
    role: demoUser.role,
    phone: demoUser.phone,
  });

  const refreshToken = signRefreshToken({
    sub: demoUser.id,
    sid: `demo_sess_${Date.now()}`,
    role: demoUser.role,
  });

  return {
    user: demoUser,
    accessToken,
    refreshToken,
    demoMode: true,
  };
};

const issueTokensForSession = async ({ user, deviceId, deviceInfo, ipAddress, userAgent }) => {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    phone: user.phone,
  });

  const sessionId = `sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const refreshToken = signRefreshToken({
    sub: user.id,
    sid: sessionId,
    role: user.role,
  });

  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  await prisma.authSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshTokenHash,
      deviceId,
      deviceInfo,
      ipAddress,
      userAgent,
      status: 'ACTIVE',
      expiresAt: parseExpiryToDate(env.JWT_REFRESH_EXPIRES_IN),
      lastUsedAt: new Date(),
    },
  });

  return { accessToken, refreshToken };
};

const sendOtp = async ({ phone, purpose }) => {
  const normalizedPhone = sanitizePhone(phone);

  if (env.DEMO_OTP_MODE && isDemoPhone(normalizedPhone)) {
    const response = {
      otpSent: true,
      expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
    };
    if (env.NODE_ENV !== 'production') {
      response.demoOtp = env.DEMO_LOGIN_OTP;
    }
    return response;
  }

  await prisma.otpCode.updateMany({
    where: {
      phone: normalizedPhone,
      status: 'PENDING',
      purpose,
    },
    data: {
      status: 'EXPIRED',
    },
  });

  const otp = env.DEMO_OTP_MODE
    ? env.DEMO_OTP_CODE
    : String(Math.floor(100000 + Math.random() * 900000));

  const codeHash = await bcrypt.hash(otp, 10);

  const expiresAt = dayjs().add(env.OTP_EXPIRY_MINUTES, 'minute').toDate();

  await prisma.otpCode.create({
    data: {
      phone: normalizedPhone,
      codeHash,
      purpose,
      expiresAt,
      status: 'PENDING',
    },
  });

  const response = {
    otpSent: true,
    expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
  };

  if (env.DEMO_OTP_MODE && env.NODE_ENV !== 'production') {
    response.demoOtp = otp;
  }

  return response;
};

const ensureReferralCode = async (userId, tx = prisma) => {
  const existing = await tx.referralCode.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  let code = buildReferralCode('CLAR');
  let isUnique = false;

  while (!isUnique) {
    const found = await tx.referralCode.findUnique({ where: { code } });
    if (!found) {
      isUnique = true;
    } else {
      code = buildReferralCode('CLAR');
    }
  }

  return tx.referralCode.create({
    data: {
      userId,
      code,
      isActive: true,
    },
  });
};

const verifyOtp = async ({
  phone,
  otp,
  displayName,
  referralCode,
  deviceId,
  deviceInfo,
  ipAddress,
  userAgent,
}) => {
  const normalizedPhone = sanitizePhone(phone);

  if (env.DEMO_OTP_MODE && isDemoPhone(normalizedPhone) && isDemoOtp(otp)) {
    return buildDemoAuthResponse({ phone: normalizedPhone });
  }

  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone: normalizedPhone,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    throw new AppError('OTP not found. Please request a new OTP.', 400, 'OTP_NOT_FOUND');
  }

  if (otpRecord.expiresAt < new Date()) {
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { status: 'EXPIRED' },
    });
    throw new AppError('OTP has expired', 400, 'OTP_EXPIRED');
  }

  if (otpRecord.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw new AppError('OTP attempts exceeded', 429, 'OTP_ATTEMPTS_EXCEEDED');
  }

  const isMatch = await bcrypt.compare(otp, otpRecord.codeHash);

  if (!isMatch) {
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError('Invalid OTP', 400, 'INVALID_OTP');
  }

  const user = await prisma.$transaction(async (tx) => {
    let existingUser = await tx.user.findUnique({ where: { phone: normalizedPhone } });

    if (!existingUser) {
      existingUser = await tx.user.create({
        data: {
          phone: normalizedPhone,
          displayName: displayName || `Anonymous-${normalizedPhone.slice(-4)}`,
          role: 'USER',
          status: 'ACTIVE',
          isPhoneVerified: true,
        },
      });

      await tx.wallet.create({
        data: {
          userId: existingUser.id,
          currency: 'INR',
        },
      });

      await tx.userSetting.create({
        data: {
          userId: existingUser.id,
        },
      });
    } else {
      if (existingUser.status === 'BLOCKED' || existingUser.status === 'DELETED' || existingUser.deletedAt) {
        throw new AppError('Account is unavailable', 403, 'ACCOUNT_UNAVAILABLE');
      }

      existingUser = await tx.user.update({
        where: { id: existingUser.id },
        data: {
          isPhoneVerified: true,
        },
      });
    }

    await ensureReferralCode(existingUser.id, tx);

    await tx.otpCode.update({
      where: { id: otpRecord.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });

    return existingUser;
  });

  if (referralCode) {
    const referralService = require('../referral/referral.service');
    await referralService.applyReferralCode({
      referredUserId: user.id,
      referralCode,
    });
  }

  const tokens = await issueTokensForSession({
    user,
    deviceId,
    deviceInfo,
    ipAddress,
    userAgent,
  });

  const safeUser = {
    id: user.id,
    role: user.role,
    phone: user.phone,
    displayName: user.displayName,
    status: user.status,
  };

  return {
    user: safeUser,
    ...tokens,
  };
};

const loginWithPassword = async ({ phoneOrEmail, password, deviceId, deviceInfo, ipAddress, userAgent }) => {
  const normalizedIdentity = String(phoneOrEmail || '').trim();
  const normalizedEmail = normalizedIdentity.toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ phone: sanitizePhone(normalizedIdentity) }, { email: normalizedEmail }],
    },
  });

  if (!user || !user.passwordHash) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (user.status === 'BLOCKED' || user.status === 'DELETED' || user.deletedAt) {
    throw new AppError('Account is unavailable', 403, 'ACCOUNT_UNAVAILABLE');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  const tokens = await issueTokensForSession({
    user,
    deviceId,
    deviceInfo,
    ipAddress,
    userAgent,
  });

  return {
    user: {
      id: user.id,
      phone: user.phone,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
    },
    ...tokens,
  };
};

const refreshAccessToken = async (refreshToken) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (_error) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const session = await prisma.authSession.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });

  if (!session || session.status !== 'ACTIVE') {
    throw new AppError('Session is inactive', 401, 'SESSION_INACTIVE');
  }

  if (session.expiresAt < new Date()) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { status: 'EXPIRED' },
    });
    throw new AppError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  const validHash = await bcrypt.compare(refreshToken, session.refreshTokenHash);
  if (!validHash) {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (session.user.status === 'BLOCKED' || session.user.status === 'DELETED' || session.user.deletedAt) {
    throw new AppError('Account is unavailable', 403, 'ACCOUNT_UNAVAILABLE');
  }

  const accessToken = signAccessToken({
    sub: session.user.id,
    role: session.user.role,
    phone: session.user.phone,
  });

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    accessToken,
  };
};

const logout = async ({ refreshToken, userId }) => {
  if (!refreshToken) {
    await prisma.authSession.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    await prisma.authSession.updateMany({
      where: {
        id: payload.sid,
        userId: payload.sub,
      },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  } catch (_error) {
    if (userId) {
      await prisma.authSession.updateMany({
        where: {
          userId,
          status: 'ACTIVE',
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      });
    }
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  loginWithPassword,
  refreshAccessToken,
  logout,
};
