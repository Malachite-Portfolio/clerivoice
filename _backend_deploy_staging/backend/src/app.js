const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { env } = require('./config/env');
const { globalRateLimiter } = require('./middleware/rateLimiter');
const { sanitizeInputMiddleware } = require('./middleware/sanitize');
const { notFoundHandler } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const agoraRoutes = require('./routes/agoraRoutes');

const app = express();
const APP_INSTANCE_ID = `clarivoice-app-${process.pid}`;
app.locals.instanceId = APP_INSTANCE_ID;

const parseAllowedOrigins = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const allowedOrigins = parseAllowedOrigins(env.CLIENT_ORIGIN);
const allowAllOrigins = allowedOrigins.includes('*');

const corsOptions = {
  origin(origin, callback) {
    // Native/mobile requests often do not send Origin.
    if (!origin) {
      return callback(null, true);
    }

    if (allowAllOrigins || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

if (env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[REQ][${APP_INSTANCE_ID}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Keep health check lightweight and available before heavier middleware chains.
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    uptimeSeconds: Number(process.uptime().toFixed(0)),
    timestamp: new Date().toISOString(),
  });
});

app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInputMiddleware);
app.use(globalRateLimiter);
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

const apiPrefixes = Array.from(new Set([env.API_PREFIX, '/api/v1', '/api'].filter(Boolean)));
apiPrefixes.forEach((prefix) => {
  app.use(prefix, routes);
});
app.use('/api/agora', agoraRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };

if (require.main === module) {
  require('./server');
}
