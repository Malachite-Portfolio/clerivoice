const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const { prisma } = require('../../config/prisma');
const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
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
const DEMO_BYPASS_OTP = '123456';
const DEMO_LISTENER_ID = '000000101';
const DEMO_LISTENER_PHONE = '+910000000101';
const DEMO_LISTENER_PASSWORD = '12345678';
const maskIdentity = (value) => {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.includes('@')) {
    const [name, domain] = input.split('@');
    return `${name.slice(0, 2)}***@${domain || ''}`;
  }
  if (input.length <= 4) return '****';
  return `${input.slice(0, 2)}***${input.slice(-2)}`;
};

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

const buildDemoListenerAuthResponse = async ({ deviceId, deviceInfo, ipAddress, userAgent }) => {
  const passwordHash = await bcrypt.hash(DEMO_LISTENER_PASSWORD, 10);

  const listenerUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { phone: DEMO_LISTENER_PHONE },
      update: {
        role: 'LISTENER',
        status: 'ACTIVE',
        passwordHash,
        displayName: 'Demo Listener',
        isPhoneVerified: true,
        deletedAt: null,
      },
      create: {
        phone: DEMO_LISTENER_PHONE,
        role: 'LISTENER',
        status: 'ACTIVE',
        passwordHash,
        displayName: 'Demo Listener',
        isPhoneVerified: true,
      },
    });

    await tx.listenerProfile.upsert({
      where: { userId: user.id },
      update: {
        availability: 'ONLINE',
        isEnabled: true,
      },
      create: {
        userId: user.id,
        bio: 'Demo listener account',
        rating: 4.9,
        experienceYears: 3,
        languages: ['English', 'Hindi'],
        category: 'Emotional Support',
        callRatePerMinute: 15,
        chatRatePerMinute: 10,
        availability: 'ONLINE',
        isEnabled: true,
      },
    });

    await tx.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        currency: 'INR',
      },
    });

    return tx.user.findUnique({
      where: { id: user.id },
      include: { listenerProfile: true },
    });
  }, {
    maxWait: 10000,
    timeout: 20000,
  });

  const tokens = await issueTokensForSession({
    user: listenerUser,
    deviceId,
    deviceInfo,
    ipAddress,
    userAgent,
  });

  return {
    user: {
      id: listenerUser.id,
      phone: listenerUser.phone,
      email: listenerUser.email,
      displayName: listenerUser.displayName,
      role: listenerUser.role,
      status: listenerUser.status,
      listenerProfile: {
        availability: listenerUser.listenerProfile.availability,
        callRatePerMinute: listenerUser.listenerProfile.callRatePerMinute,
        chatRatePerMinute: listenerUser.listenerProfile.chatRatePerMinute,
        isEnabled: listenerUser.listenerProfile.isEnabled,
      },
    },
    ...tokens,
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
  logger.info('[Auth] sendOtp started', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    demoMode: env.DEMO_OTP_MODE,
  });

  if (env.DEMO_OTP_MODE && isDemoPhone(normalizedPhone)) {
    const response = {
      otpSent: true,
      expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
    };
    if (env.NODE_ENV !== 'production') {
      response.demoOtp = env.DEMO_LOGIN_OTP;
    }
    logger.info('[Auth] sendOtp demo response prepared', {
      phone: maskIdentity(normalizedPhone),
      expiresInSeconds: response.expiresInSeconds,
    });
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

  logger.info('[Auth] sendOtp stored OTP record', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    expiresAt,
  });
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

const upsertOtpUser = async ({ normalizedPhone, displayName, otpRecordId }) => {
  return prisma.$transaction(async (tx) => {
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

    if (otpRecordId) {
      await tx.otpCode.update({
        where: { id: otpRecordId },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      });
    }

    return existingUser;
  }, {
    maxWait: 10000,
    timeout: 20000,
  });
};

const verifyOtp = async ({
  phone,
  otp,
  purpose = 'LOGIN',
  displayName,
  referralCode,
  deviceId,
  deviceInfo,
  ipAddress,
  userAgent,
}) => {
  const normalizedPhone = sanitizePhone(phone);
  logger.info('[Auth] verifyOtp started', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    otpLength: String(otp || '').length,
    hasDisplayName: Boolean(displayName),
    hasReferralCode: Boolean(referralCode),
  });

  if (env.DEMO_USER_OTP_BYPASS && String(otp || '').trim() === DEMO_BYPASS_OTP) {
    const user = await upsertOtpUser({
      normalizedPhone,
      displayName,
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

    return {
      user: {
        id: user.id,
        role: user.role,
        phone: user.phone,
        displayName: user.displayName,
        status: user.status,
      },
      ...tokens,
      demoMode: true,
    };
  }

  if (env.DEMO_OTP_MODE && isDemoPhone(normalizedPhone) && isDemoOtp(otp)) {
    return buildDemoAuthResponse({ phone: normalizedPhone });
  }

  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone: normalizedPhone,
      purpose,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
  });

  logger.info('[Auth] verifyOtp lookup result', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    found: Boolean(otpRecord),
    status: otpRecord?.status || null,
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
  logger.info('[Auth] verifyOtp compare result', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    matched: isMatch,
    attempts: otpRecord.attempts,
  });

  if (!isMatch) {
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError('Invalid OTP', 400, 'INVALID_OTP');
  }

  const user = await upsertOtpUser({
    normalizedPhone,
    displayName,
    otpRecordId: otpRecord.id,
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

const loginUserWithOtp = async (payload) => {
  logger.info('[Auth] loginUserWithOtp started', {
    keys: Object.keys(payload || {}),
    phone: maskIdentity(payload?.phone),
    hasOtp: Boolean(String(payload?.otp || '').trim()),
  });

  const demoOtpBypass =
    String(process.env.DEMO_USER_OTP_BYPASS).toLowerCase() === 'true';
  const incomingOtp = String(
    payload?.otp ||
      payload?.code ||
      payload?.otpCode ||
      payload?.verificationCode ||
      payload?.pin ||
      ''
  ).trim();

  if (demoOtpBypass && incomingOtp === '123456') {
    return {
      user: {
        id: 'demo-user',
        phone: payload.phone || 'demo',
        role: 'USER',
        status: 'ACTIVE',
        displayName: 'Demo User',
      },
      accessToken: 'demo-token',
      refreshToken: 'demo-refresh-token',
      demoMode: true,
    };
  }

  return verifyOtp(payload);
};

const loginWithPassword = async ({ phoneOrEmail, password, deviceId, deviceInfo, ipAddress, userAgent }) => {
  const normalizedIdentity = String(phoneOrEmail || '').trim();
  const normalizedEmail = normalizedIdentity.toLowerCase();
  const maskedIdentity = maskIdentity(normalizedIdentity);

  logger.info('[Auth] loginWithPassword started', {
    identity: maskedIdentity,
    hasPassword: Boolean(password),
  });

  let user;
  try {
    user = await prisma.user.findFirst({
      where: {
        OR: [{ phone: sanitizePhone(normalizedIdentity) }, { email: normalizedEmail }],
      },
    });
  } catch (error) {
    logger.error('[Auth] user lookup failed', {
      identity: maskedIdentity,
      message: error?.message,
    });
    throw new AppError('Unable to process login at the moment', 500, 'AUTH_LOOKUP_FAILED');
  }

  logger.info('[Auth] user lookup result', {
    identity: maskedIdentity,
    found: Boolean(user),
    userId: user?.id,
    role: user?.role,
    status: user?.status,
    hasPasswordHash: Boolean(user?.passwordHash),
  });

  if (!user || !user.passwordHash) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (user.status === 'BLOCKED' || user.status === 'DELETED' || user.deletedAt) {
    throw new AppError('Account is unavailable', 403, 'ACCOUNT_UNAVAILABLE');
  }

  let isMatch = false;
  try {
    isMatch = await bcrypt.compare(String(password || ''), user.passwordHash);
  } catch (error) {
    logger.error('[Auth] password compare failed', {
      userId: user.id,
      message: error?.message,
    });
    throw new AppError('Unable to process login at the moment', 500, 'PASSWORD_COMPARE_FAILED');
  }

  logger.info('[Auth] password compare result', {
    userId: user.id,
    matched: isMatch,
  });

  if (!isMatch) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  let tokens;
  try {
    tokens = await issueTokensForSession({
      user,
      deviceId,
      deviceInfo,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    logger.error('[Auth] session token issue failed', {
      userId: user.id,
      message: error?.message,
    });
    throw new AppError('Unable to process login at the moment', 500, 'SESSION_ISSUE_FAILED');
  }

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

const loginListenerWithPassword = async ({
  listenerIdentity,
  listenerId,
  phoneOrEmail,
  phone,
  email,
  password,
  deviceId,
  deviceInfo,
  ipAddress,
  userAgent,
}) => {
  const rawIdentity = String(
    listenerIdentity || listenerId || phoneOrEmail || phone || email || ''
  ).trim();
  const normalizedEmail = rawIdentity.toLowerCase();
  const maskedIdentity = maskIdentity(rawIdentity);

  logger.info('[Auth] loginListenerWithPassword started', {
    identity: maskedIdentity,
    hasPassword: Boolean(password),
  });

  if (
    env.DEMO_LISTENER_LOGIN_BYPASS &&
    rawIdentity === DEMO_LISTENER_ID &&
    String(password || '') === DEMO_LISTENER_PASSWORD
  ) {
    return buildDemoListenerAuthResponse({
      deviceId,
      deviceInfo,
      ipAddress,
      userAgent,
    });
  }

  if (!rawIdentity) {
    throw new AppError(
      'Listener ID, phone, or email is required',
      400,
      'LISTENER_IDENTITY_REQUIRED'
    );
  }

  let listenerUser;
  try {
    listenerUser = await prisma.user.findFirst({
      where: {
        role: 'LISTENER',
        OR: [{ id: rawIdentity }, { phone: sanitizePhone(rawIdentity) }, { email: normalizedEmail }],
      },
      include: {
        listenerProfile: true,
      },
    });
  } catch (error) {
    logger.error('[Auth] listener lookup failed', {
      identity: maskedIdentity,
      message: error?.message,
    });
    throw new AppError(
      'Unable to process listener login at the moment',
      500,
      'LISTENER_LOOKUP_FAILED'
    );
  }

  logger.info('[Auth] listener lookup result', {
    identity: maskedIdentity,
    found: Boolean(listenerUser),
    userId: listenerUser?.id,
    role: listenerUser?.role,
    status: listenerUser?.status,
    hasListenerProfile: Boolean(listenerUser?.listenerProfile),
    hasPasswordHash: Boolean(listenerUser?.passwordHash),
  });

  if (!listenerUser || !listenerUser.passwordHash) {
    throw new AppError('Invalid listener credentials', 401, 'INVALID_LISTENER_CREDENTIALS');
  }

  if (listenerUser.status === 'BLOCKED' || listenerUser.status === 'DELETED' || listenerUser.deletedAt) {
    throw new AppError('Listener account is unavailable', 403, 'LISTENER_UNAVAILABLE');
  }

  if (!listenerUser.listenerProfile || !listenerUser.listenerProfile.isEnabled) {
    throw new AppError('Listener profile is unavailable', 403, 'LISTENER_PROFILE_UNAVAILABLE');
  }

  let isMatch = false;
  try {
    isMatch = await bcrypt.compare(String(password || ''), listenerUser.passwordHash);
  } catch (error) {
    logger.error('[Auth] listener password compare failed', {
      userId: listenerUser.id,
      message: error?.message,
    });
    throw new AppError(
      'Unable to process listener login at the moment',
      500,
      'LISTENER_PASSWORD_COMPARE_FAILED'
    );
  }

  logger.info('[Auth] listener password compare result', {
    userId: listenerUser.id,
    matched: isMatch,
  });

  if (!isMatch) {
    throw new AppError('Invalid listener credentials', 401, 'INVALID_LISTENER_CREDENTIALS');
  }

  let tokens;
  try {
    tokens = await issueTokensForSession({
      user: listenerUser,
      deviceId,
      deviceInfo,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    logger.error('[Auth] listener session issue failed', {
      userId: listenerUser.id,
      message: error?.message,
    });
    throw new AppError(
      'Unable to process listener login at the moment',
      500,
      'LISTENER_SESSION_ISSUE_FAILED'
    );
  }

  return {
    user: {
      id: listenerUser.id,
      phone: listenerUser.phone,
      email: listenerUser.email,
      displayName: listenerUser.displayName,
      role: listenerUser.role,
      status: listenerUser.status,
      listenerProfile: {
        availability: listenerUser.listenerProfile.availability,
        callRatePerMinute: listenerUser.listenerProfile.callRatePerMinute,
        chatRatePerMinute: listenerUser.listenerProfile.chatRatePerMinute,
        isEnabled: listenerUser.listenerProfile.isEnabled,
      },
    },
    ...tokens,
  };
};

const refreshAccessToken = async (refreshToken) => {
  logger.info('[Auth] refreshAccessToken started', {
    hasRefreshToken: Boolean(refreshToken),
  });
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

  logger.info('[Auth] refreshAccessToken session lookup result', {
    found: Boolean(session),
    sessionStatus: session?.status || null,
    userId: session?.userId || null,
    role: session?.user?.role || null,
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
  logger.info('[Auth] logout started', {
    hasRefreshToken: Boolean(refreshToken),
    userId: userId || null,
  });
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
  loginUserWithOtp,
  loginWithPassword,
  loginListenerWithPassword,
  refreshAccessToken,
  logout,
};
