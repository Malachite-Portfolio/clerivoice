const { app } = require('./app');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { connectRedis } = require('./config/redis');
const { connectPrisma } = require('./config/prisma');
const { SessionBillingManager } = require('./jobs/sessionBillingManager');
const { initSocket } = require('./socket');

process.on('uncaughtException', (error) => {
  logger.error('uncaughtException', {
    message: error?.message,
    stack: error?.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

const startRedisWarmup = async () => {
  try {
    await Promise.race([
      connectRedis(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis warmup timeout after 5s')), 5000);
      }),
    ]);
    logger.info('Redis warmup completed.');
  } catch (error) {
    logger.warn('Redis is not available at startup; continuing without hard failure.', {
      message: error.message,
    });
  }
};

const startServer = async () => {
  const PORT = Number(process.env.PORT || 8080);
  const HOST = '0.0.0.0';

  if (!Number.isFinite(PORT) || PORT <= 0) {
    throw new Error('PORT must be a valid positive number.');
  }

  await connectPrisma();

  const httpServer = require('http').createServer(app);
  logger.info('HTTP server wired to express app instance', {
    appInstanceId: app.locals.instanceId,
  });

  const billingManager = new SessionBillingManager(null);
  const io = initSocket({
    httpServer,
    billingManager,
    clientOrigin: env.CLIENT_ORIGIN,
  });

  billingManager.io = io;

  httpServer.on('error', (error) => {
    logger.error('HTTP server failed to start', {
      error: error.message,
      code: error.code,
      appInstanceId: app.locals.instanceId,
    });
    process.exit(1);
  });

  httpServer.listen(PORT, HOST, () => {
    logger.info('Server listening', {
      host: HOST,
      port: PORT,
      nodeEnv: env.NODE_ENV,
      appInstanceId: app.locals.instanceId,
    });
  });

  // Do not block HTTP readiness on Redis connectivity.
  void startRedisWarmup();

  const shutdown = () => {
    logger.info('Received shutdown signal. Closing server...');
    billingManager.stopAll();
    io.close(() => {
      httpServer.close(() => {
        logger.info('Server closed gracefully.');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer().catch((error) => {
  logger.error('Failed to start server', { error: error.message, stack: error.stack });
  process.exit(1);
});

