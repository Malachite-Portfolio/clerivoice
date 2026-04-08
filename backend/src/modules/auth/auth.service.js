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

const sanitizePhone = (phone) => String(phone || '').replace(/[\s()-]/g, '').trim();
const normalizePhone = (phone) => {
  const sanitized = sanitizePhone(phone);
  const digits = sanitized.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (sanitized.startsWith('+')) {
    return `+${digits}`;
  }

  return sanitized;
};
const buildPhoneVariants = (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const digits = normalizedPhone.replace(/\D/g, '');
  const variants = new Set();

  if (normalizedPhone) {
    variants.add(normalizedPhone);
  }

  if (digits) {
    variants.add(digits);
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    variants.add(digits.slice(2));
    variants.add(`+${digits}`);
  }

  if (digits.length === 10) {
    variants.add(`91${digits}`);
    variants.add(`+91${digits}`);
  }

  return [...variants].filter(Boolean);
};
const isNonProduction = env.NODE_ENV !== 'production';
const parseEnvList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
const getConfiguredTestPhones = ({ primary, listA, listB }) => {
  const values = [...parseEnvList(primary), ...parseEnvList(listA), ...parseEnvList(listB)];
  return [...new Set(values)];
};

const buildAllowedPhoneSet = (...phones) => {
  const values = phones
    .flatMap((value) => buildPhoneVariants(value))
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return new Set(values);
};

const isTestAuthEnabled = () => isNonProduction && env.ENABLE_TEST_AUTH;
const getAllowedTestUserPhones = () =>
  buildAllowedPhoneSet(
    ...getConfiguredTestPhones({
      primary: env.TEST_USER_PHONE,
      listA: env.TEST_USER_PHONES,
      listB: env.TEST_USER_NUMBERS,
    }),
  );
const getAllowedTestListenerPhones = () =>
  buildAllowedPhoneSet(
    ...getConfiguredTestPhones({
      primary: env.TEST_LISTENER_PHONE,
      listA: env.TEST_LISTENER_PHONES,
      listB: env.TEST_LISTENER_NUMBERS,
    }),
  );
const isTestUserPhone = (phone) =>
  getAllowedTestUserPhones().has(normalizePhone(phone)) ||
  buildPhoneVariants(phone).some((variant) => getAllowedTestUserPhones().has(variant));
const isTestListenerPhone = (phone) =>
  getAllowedTestListenerPhones().has(normalizePhone(phone)) ||
  buildPhoneVariants(phone).some((variant) => getAllowedTestListenerPhones().has(variant));
const buildMaskedAllowedPhoneList = (role) =>
  [...(role === 'LISTENER' ? getAllowedTestListenerPhones() : getAllowedTestUserPhones())].map(
    maskIdentity
  );

const buildOtpResponse = (metadata = {}) => {
  const response = {
    otpSent: true,
    expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
  };

  if (env.NODE_ENV !== 'production' && metadata?.debugOtp) {
    response.debugOtp = metadata.debugOtp;
  }

  return response;
};

const expirePendingOtpRecords = async ({ normalizedPhone, purpose }) => {
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
};

const createOtpChallenge = async ({ normalizedPhone, purpose, otp, metadata }) => {
  await expirePendingOtpRecords({ normalizedPhone, purpose });

  const codeHash = await bcrypt.hash(otp, 10);
  const expiresAt = dayjs().add(env.OTP_EXPIRY_MINUTES, 'minute').toDate();

  const otpRecord = await prisma.otpCode.create({
    data: {
      phone: normalizedPhone,
      codeHash,
      purpose,
      expiresAt,
      status: 'PENDING',
      ...(metadata ? { metadata } : {}),
    },
  });

  logger.info('[Auth] OTP challenge stored', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    otpRecordId: otpRecord.id,
    metadataRole: metadata?.role || null,
    testAuth: metadata?.testAuth === true,
    expiresAt,
  });

  return buildOtpResponse({
    debugOtp: metadata?.testAuth === true ? env.TEST_AUTH_FIXED_OTP : env.DEMO_OTP_MODE ? otp : null,
  });
};

const findLatestPendingOtpRecord = async ({ normalizedPhone, purpose }) => {
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone: normalizedPhone,
      purpose,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
  });

  logger.info('[Auth] OTP lookup result', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    found: Boolean(otpRecord),
    status: otpRecord?.status || null,
    otpRecordId: otpRecord?.id || null,
  });

  return otpRecord;
};

const assertOtpRecordIsUsable = async ({ otpRecord }) => {
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
};

const verifyOtpChallenge = async ({ normalizedPhone, purpose, otpRecord, otp }) => {
  await assertOtpRecordIsUsable({ otpRecord });

  const isMatch = await bcrypt.compare(String(otp || ''), otpRecord.codeHash);
  logger.info('[Auth] OTP compare result', {
    phone: maskIdentity(normalizedPhone),
    purpose,
    otpRecordId: otpRecord.id,
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

  return otpRecord;
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
  const normalizedPhone = normalizePhone(phone);
  const isTestNumber = isTestAuthEnabled() && isTestUserPhone(normalizedPhone);
  const useLegacyDemoOtp = isNonProduction && env.DEMO_OTP_MODE;
  const fixedTestOtp = String(env.TEST_AUTH_FIXED_OTP || '').trim();
  const useFixedTestOtp = isTestNumber && Boolean(fixedTestOtp);
  logger.info('[Auth] sendOtp started', {
    phone: maskIdentity(normalizedPhone),
    incomingPhone: maskIdentity(phone),
    phoneVariants: buildPhoneVariants(phone).map(maskIdentity),
    purpose,
    demoMode: useLegacyDemoOtp,
    testAuthEnabled: isTestAuthEnabled(),
    isTestNumber,
    allowedTestPhones: buildMaskedAllowedPhoneList('USER'),
  });

  const otp = useFixedTestOtp
    ? fixedTestOtp
    : useLegacyDemoOtp
      ? env.DEMO_OTP_CODE
      : String(Math.floor(100000 + Math.random() * 900000));

  return createOtpChallenge({
    normalizedPhone,
    purpose,
    otp,
    metadata:
      useFixedTestOtp
        ? { role: 'USER', testAuth: true }
        : useLegacyDemoOtp
          ? { role: 'USER', legacyDemoOtp: true }
          : null,
  });
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

const upsertOtpListenerUser = async ({ normalizedPhone, otpRecordId }) => {
  return prisma.$transaction(async (tx) => {
    let listenerUser = await tx.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        listenerProfile: true,
      },
    });

    if (!listenerUser) {
      listenerUser = await tx.user.create({
        data: {
          phone: normalizedPhone,
          displayName: env.TEST_LISTENER_DISPLAY_NAME,
          role: 'LISTENER',
          status: 'ACTIVE',
          isPhoneVerified: true,
        },
        include: {
          listenerProfile: true,
        },
      });
    } else if (
      listenerUser.role !== 'LISTENER' ||
      listenerUser.status !== 'ACTIVE' ||
      listenerUser.deletedAt ||
      !listenerUser.isPhoneVerified
    ) {
      listenerUser = await tx.user.update({
        where: { id: listenerUser.id },
        data: {
          role: 'LISTENER',
          status: 'ACTIVE',
          displayName: listenerUser.displayName || env.TEST_LISTENER_DISPLAY_NAME,
          isPhoneVerified: true,
          deletedAt: null,
        },
        include: {
          listenerProfile: true,
        },
      });
    }

    await tx.listenerProfile.upsert({
      where: { userId: listenerUser.id },
      update: {
        availability: 'ONLINE',
        isEnabled: true,
      },
      create: {
        userId: listenerUser.id,
        bio: 'Test listener account',
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
      where: { userId: listenerUser.id },
      update: {},
      create: {
        userId: listenerUser.id,
        currency: 'INR',
      },
    });

    if (otpRecordId) {
      await tx.otpCode.update({
        where: { id: otpRecordId },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
        },
      });
    }

    return tx.user.findUnique({
      where: { id: listenerUser.id },
      include: {
        listenerProfile: true,
      },
    });
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
  const normalizedPhone = normalizePhone(phone);
  const isTestNumber = isTestAuthEnabled() && isTestUserPhone(normalizedPhone);
  logger.info('[Auth] verifyOtp started', {
    phone: maskIdentity(normalizedPhone),
    incomingPhone: maskIdentity(phone),
    phoneVariants: buildPhoneVariants(phone).map(maskIdentity),
    purpose,
    otpLength: String(otp || '').length,
    hasDisplayName: Boolean(displayName),
    hasReferralCode: Boolean(referralCode),
    testAuthEnabled: isTestAuthEnabled(),
    isTestNumber,
    allowedTestPhones: buildMaskedAllowedPhoneList('USER'),
  });

  const otpRecord = await findLatestPendingOtpRecord({
    normalizedPhone,
    purpose,
  });
  await verifyOtpChallenge({
    normalizedPhone,
    purpose,
    otpRecord,
    otp,
  });

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

  return verifyOtp(payload);
};

const sendListenerOtp = async ({ phone, purpose = 'LOGIN' }) => {
  const normalizedPhone = normalizePhone(phone);
  const isAllowedTestNumber = isTestAuthEnabled() && isTestListenerPhone(normalizedPhone);
  const fixedTestOtp = String(env.TEST_AUTH_FIXED_OTP || '').trim();

  logger.info('[Auth] sendListenerOtp started', {
    phone: maskIdentity(normalizedPhone),
    incomingPhone: maskIdentity(phone),
    phoneVariants: buildPhoneVariants(phone).map(maskIdentity),
    purpose,
    testAuthEnabled: isTestAuthEnabled(),
    isAllowedTestNumber,
    allowedTestPhones: buildMaskedAllowedPhoneList('LISTENER'),
  });

  if (!isAllowedTestNumber) {
    throw new AppError(
      'Listener test OTP is not enabled for this phone number.',
      403,
      'LISTENER_TEST_AUTH_DISABLED'
    );
  }

  if (!fixedTestOtp) {
    throw new AppError(
      'Listener test OTP is misconfigured. TEST_AUTH_FIXED_OTP is required.',
      500,
      'LISTENER_TEST_AUTH_MISCONFIGURED'
    );
  }

  return createOtpChallenge({
    normalizedPhone,
    purpose,
    otp: fixedTestOtp,
    metadata: {
      role: 'LISTENER',
      testAuth: true,
    },
  });
};

const verifyListenerOtp = async ({
  phone,
  otp,
  purpose = 'LOGIN',
  deviceId,
  deviceInfo,
  ipAddress,
  userAgent,
}) => {
  const normalizedPhone = normalizePhone(phone);
  const isAllowedTestNumber = isTestAuthEnabled() && isTestListenerPhone(normalizedPhone);

  logger.info('[Auth] verifyListenerOtp started', {
    phone: maskIdentity(normalizedPhone),
    incomingPhone: maskIdentity(phone),
    phoneVariants: buildPhoneVariants(phone).map(maskIdentity),
    purpose,
    otpLength: String(otp || '').length,
    testAuthEnabled: isTestAuthEnabled(),
    isAllowedTestNumber,
    allowedTestPhones: buildMaskedAllowedPhoneList('LISTENER'),
  });

  if (!isAllowedTestNumber) {
    throw new AppError(
      'Listener test OTP is not enabled for this phone number.',
      403,
      'LISTENER_TEST_AUTH_DISABLED'
    );
  }

  const otpRecord = await findLatestPendingOtpRecord({
    normalizedPhone,
    purpose,
  });

  await verifyOtpChallenge({
    normalizedPhone,
    purpose,
    otpRecord,
    otp,
  });

  const listenerUser = await upsertOtpListenerUser({
    normalizedPhone,
    otpRecordId: otpRecord.id,
  });

  if (!listenerUser?.listenerProfile || !listenerUser.listenerProfile.isEnabled) {
    throw new AppError('Listener profile is unavailable', 403, 'LISTENER_PROFILE_UNAVAILABLE');
  }

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
  };
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
        OR: [{ phone: normalizePhone(normalizedIdentity) }, { email: normalizedEmail }],
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
        OR: [{ id: rawIdentity }, { phone: normalizePhone(rawIdentity) }, { email: normalizedEmail }],
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
  sendListenerOtp,
  verifyOtp,
  verifyListenerOtp,
  loginUserWithOtp,
  loginWithPassword,
  loginListenerWithPassword,
  refreshAccessToken,
  logout,
};
