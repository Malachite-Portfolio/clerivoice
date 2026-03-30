const { PrismaClient } = require('@prisma/client');
const { env } = require('./env');
const { logger } = require('./logger');

const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const getDatabaseHost = () => {
  try {
    const parsed = new URL(env.DATABASE_URL);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch (_error) {
    return 'unparseable-database-url';
  }
};

const connectPrisma = async () => {
  const databaseHost = getDatabaseHost();
  logger.info('[Prisma] connecting to database', {
    databaseHost,
  });
  await prisma.$connect();
  logger.info('[Prisma] database connection established', {
    databaseHost,
  });
};

module.exports = { prisma, connectPrisma, getDatabaseHost };
