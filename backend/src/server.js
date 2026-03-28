const http = require('http');
const { app } = require('./app');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { connectRedis } = require('./config/redis');
const { SessionBillingManager } = require('./jobs/sessionBillingManager');
const { initSocket } = require('./socket');

const startServer = async () => {
  const PORT = process.env.PORT || env.PORT || 3000;

  try {
    await connectRedis();
  } catch (error) {
    logger.warn('Redis is not available at startup; continuing without hard failure.', {
      message: error.message,
    });
  }

  const httpServer = http.createServer(app);
  const billingManager = new SessionBillingManager(null);
  const io = initSocket({
    httpServer,
    billingManager,
    clientOrigin: env.CLIENT_ORIGIN,
  });

  billingManager.io = io;

  httpServer.listen(PORT, () => {
    logger.info(`Clarivoice backend running on port ${PORT}`);
  });

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
