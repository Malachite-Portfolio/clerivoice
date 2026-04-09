const Redis = require('ioredis');
const { env } = require('./env');
const { logger } = require('./logger');

const redisUrl = String(env.REDIS_URL || '').trim();
const REDIS_ERROR_LOG_THROTTLE_MS = 30_000;
let lastRedisErrorLogAt = 0;

const resolveRedisTlsConfig = () => {
  try {
    const parsedUrl = new URL(redisUrl);
    const tlsFromUrl = parsedUrl.protocol === 'rediss:';
    const tlsFromEnv = String(process.env.REDIS_TLS || '').toLowerCase() === 'true';

    if (!tlsFromUrl && !tlsFromEnv) {
      return undefined;
    }

    const rejectUnauthorized =
      String(process.env.REDIS_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !==
      'false';

    return { rejectUnauthorized };
  } catch (_error) {
    return undefined;
  }
};

const tlsConfig = resolveRedisTlsConfig();

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableOfflineQueue: false,
  connectTimeout: 10_000,
  ...(tlsConfig ? { tls: tlsConfig } : {}),
  retryStrategy(times) {
    const delayMs = Math.min(times * 200, 5_000);

    if (times === 1 || times % 10 === 0) {
      logger.warn('[Redis] reconnecting', { attempt: times, delayMs });
    }

    return delayMs;
  },
});

redis.on('error', (error) => {
  const now = Date.now();
  if (now - lastRedisErrorLogAt >= REDIS_ERROR_LOG_THROTTLE_MS) {
    logger.warn('[Redis] connection error', {
      message: error?.message || 'Unknown Redis error',
    });
    lastRedisErrorLogAt = now;
  }
});

redis.on('ready', () => {
  logger.info('[Redis] connection established');
});

redis.on('end', () => {
  logger.warn('[Redis] connection closed');
});

const connectRedis = async () => {
  if (redis.status !== 'ready') {
    await redis.connect();
  }

  return redis;
};

module.exports = { redis, connectRedis };
