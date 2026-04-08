const Redis = require('ioredis');
const { env } = require('./env');

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (error) => {
  console.error('[Redis] Connection error:', error.message);
});

const connectRedis = async () => {
  if (redis.status !== 'ready') {
    await redis.connect();
  }
};

module.exports = { redis, connectRedis };
