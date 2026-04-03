const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');

const FALLBACK_AVATAR_VERSION = 'clarivoice-avatar-v1';

const normalizeText = (value) => String(value || '').trim();

const isRemoteOrLocalImageUri = (value) =>
  /^(https?:\/\/|file:\/\/|content:\/\/|data:image\/)/i.test(value);

const normalizeAvatarUri = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  return isRemoteOrLocalImageUri(normalized) ? normalized : '';
};

const hashText = (value) => {
  const text = normalizeText(value) || FALLBACK_AVATAR_VERSION;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildAvatarSeed = ({
  id,
  userId,
  listenerId,
  phone,
  name,
  displayName,
  role,
  fallbackKey,
} = {}) => {
  const seedSegments = [
    normalizeText(id),
    normalizeText(userId),
    normalizeText(listenerId),
    normalizeText(phone),
    normalizeText(name),
    normalizeText(displayName),
    normalizeText(role),
    normalizeText(fallbackKey),
    FALLBACK_AVATAR_VERSION,
  ].filter(Boolean);

  if (seedSegments.length) {
    return seedSegments.join(':');
  }

  return `${FALLBACK_AVATAR_VERSION}:guest`;
};

export const buildRandomAvatarFallbackUrl = (seedInput = {}) => {
  const seed = buildAvatarSeed(seedInput);
  const variant = hashText(seed) % 9;
  return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${encodeURIComponent(
    seed,
  )}&radius=50&scale=95&flip=${variant % 2 === 0 ? 'false' : 'true'}`;
};

export const resolveAvatarUri = ({
  uploadedImageUrl,
  profileImageUrl,
  avatarUrl,
  avatarUri,
  source,
  ...seedInput
} = {}) => {
  const uploaded = normalizeAvatarUri(uploadedImageUrl);
  if (uploaded) {
    return uploaded;
  }

  const explicitAvatar =
    normalizeAvatarUri(avatarUrl) ||
    normalizeAvatarUri(avatarUri) ||
    normalizeAvatarUri(source);
  if (explicitAvatar) {
    return explicitAvatar;
  }

  const stored = normalizeAvatarUri(profileImageUrl);
  if (stored) {
    return stored;
  }

  return buildRandomAvatarFallbackUrl(seedInput);
};

export const resolveAvatarSource = (input = {}) => {
  if (typeof input === 'number') {
    return input;
  }

  if (input && typeof input === 'object' && !Array.isArray(input) && typeof input.uri === 'string') {
    const normalizedObjectUri = normalizeAvatarUri(input.uri);
    if (normalizedObjectUri) {
      return { uri: normalizedObjectUri };
    }
  }

  if (typeof input === 'string') {
    const normalizedUri = normalizeAvatarUri(input);
    if (normalizedUri) {
      return { uri: normalizedUri };
    }
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const uri = resolveAvatarUri(input);
    return uri ? { uri } : avatarPlaceholder;
  }

  return avatarPlaceholder;
};

