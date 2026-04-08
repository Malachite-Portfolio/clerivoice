const { prisma } = require('../config/prisma');
const { logger } = require('../config/logger');
const { AppError } = require('../utils/appError');

const SUSPENSION_HOURS = 2;
const SUSPENSION_DURATION_MS = SUSPENSION_HOURS * 60 * 60 * 1000;

const ACCOUNT_SUSPENSION_MESSAGE =
  'Your account is temporarily suspended for 2 hours due to sharing restricted contact information.';

const CONTACT_INTENT_REGEX =
  /\b(text me on|contact me at|my insta is|my telegram|my snap|my gmail|reach me on|follow me on)\b/i;
const PLATFORM_HINT_REGEX =
  /\b(instagram|insta|telegram|snapchat|snap|facebook|twitter|discord|skype|reddit|linkedin|whatsapp)\b/i;
const EMAIL_REGEX = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const PHONE_CANDIDATE_REGEX = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const SOCIAL_LINK_REGEX =
  /\b(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|t\.me|telegram\.me|snapchat\.com|facebook\.com|twitter\.com|x\.com|discord\.gg|discord\.com|skype\.com|reddit\.com|linkedin\.com)\/\S+/i;
const HANDLE_REGEX = /(?:^|\s)@[a-z0-9._-]{3,32}\b/i;
const PLATFORM_HANDLE_REGEX =
  /\b(?:instagram|insta|telegram|snapchat|snap|facebook|twitter|discord|skype|reddit|linkedin|whatsapp)\b(?:\s+(?:id|handle|username|user|is|at|on))?\s*[:=\-]?\s*@?[a-z0-9._-]{3,32}\b/i;

const normalizeMessage = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const hasPhoneNumber = (content) => {
  const candidates = content.match(PHONE_CANDIDATE_REGEX) || [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  });
};

const detectRestrictedContent = (rawContent) => {
  const content = normalizeMessage(rawContent);
  if (!content) {
    return { blocked: false, reasons: [] };
  }

  const reasons = new Set();
  const hasEmail = EMAIL_REGEX.test(content);
  const hasPhone = hasPhoneNumber(content);
  const hasSocialLink = SOCIAL_LINK_REGEX.test(content);
  const hasContactIntent = CONTACT_INTENT_REGEX.test(content);
  const hasPlatformHint = PLATFORM_HINT_REGEX.test(content);
  const hasExplicitHandlePattern = PLATFORM_HANDLE_REGEX.test(content);
  const hasAtHandle = HANDLE_REGEX.test(content);
  const hasSocialHandle =
    hasExplicitHandlePattern || (hasAtHandle && (hasContactIntent || hasPlatformHint || hasSocialLink));

  if (hasEmail) {
    reasons.add('EMAIL');
  }

  if (hasPhone) {
    reasons.add('PHONE');
  }

  if (hasSocialLink) {
    reasons.add('SOCIAL_LINK');
  }

  if (hasSocialHandle) {
    reasons.add('SOCIAL_HANDLE');
  }

  return {
    blocked: reasons.size > 0,
    reasons: Array.from(reasons),
  };
};

const getActiveSuspension = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      suspendedUntil: true,
      suspensionReason: true,
    },
  });

  if (!user?.suspendedUntil) {
    return null;
  }

  const suspendedUntilTs = new Date(user.suspendedUntil).getTime();
  if (!Number.isFinite(suspendedUntilTs) || suspendedUntilTs <= Date.now()) {
    return null;
  }

  return {
    userId: user.id,
    suspendedUntil: user.suspendedUntil,
    suspensionReason: user.suspensionReason || 'RESTRICTED_CONTACT_INFO',
  };
};

const assertNotSuspended = async ({ userId, action }) => {
  const activeSuspension = await getActiveSuspension(userId);
  if (!activeSuspension) {
    return;
  }

  throw new AppError(
    ACCOUNT_SUSPENSION_MESSAGE,
    403,
    'ACCOUNT_SUSPENDED',
    {
      action: action || null,
      suspendedUntil: activeSuspension.suspendedUntil,
      suspensionReason: activeSuspension.suspensionReason,
    },
  );
};

const suspendForRestrictedContact = async ({
  userId,
  sessionId,
  sessionType = 'CHAT',
  originalContent,
  detectedReasons = [],
}) => {
  const now = Date.now();
  const suspendedUntilTarget = new Date(now + SUSPENSION_DURATION_MS);

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { suspendedUntil: true },
    });

    const currentSuspendedUntilTs = current?.suspendedUntil
      ? new Date(current.suspendedUntil).getTime()
      : 0;
    const nextSuspendedUntil =
      currentSuspendedUntilTs > suspendedUntilTarget.getTime()
        ? new Date(currentSuspendedUntilTs)
        : suspendedUntilTarget;

    await tx.user.update({
      where: { id: userId },
      data: {
        suspendedUntil: nextSuspendedUntil,
        suspensionReason: 'RESTRICTED_CONTACT_INFO',
      },
    });

    const violation = await tx.moderationViolation.create({
      data: {
        userId,
        sessionId: sessionId || null,
        sessionType: String(sessionType || 'CHAT').toUpperCase(),
        originalContent: String(originalContent || ''),
        detectedReasons,
        suspendedUntil: nextSuspendedUntil,
      },
    });

    return {
      suspendedUntil: nextSuspendedUntil,
      violationId: violation.id,
    };
  });

  logger.warn('[Moderation] restricted contact violation logged', {
    userId,
    sessionId: sessionId || null,
    sessionType: String(sessionType || 'CHAT').toUpperCase(),
    detectedReasons,
    suspendedUntil: result.suspendedUntil.toISOString(),
    violationId: result.violationId,
  });

  return result;
};

module.exports = {
  ACCOUNT_SUSPENSION_MESSAGE,
  detectRestrictedContent,
  assertNotSuspended,
  getActiveSuspension,
  suspendForRestrictedContact,
};
