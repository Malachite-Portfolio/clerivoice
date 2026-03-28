const express = require('express');
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
const originList = env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim());
const allowAllOrigins = originList.includes('*');

app.use(
  cors({
    origin: allowAllOrigins ? '*' : originList,
    credentials: !allowAllOrigins,
  })
);

app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInputMiddleware);
app.use(globalRateLimiter);
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (_req, res) => {
  res.status(200).send('Server is running 🚀');
});

app.use(env.API_PREFIX, routes);
app.use('/api/agora', agoraRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };
