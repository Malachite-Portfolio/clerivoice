const { config } = require('dotenv');
const { z } = require('zod');

if (!process.env.K_SERVICE) {
  // Load local .env only outside Cloud Run.
  config();
}

const tokenExpireSecondsFromEnv =
  process.env.AGORA_TOKEN_EXPIRE_SECONDS ||
  process.env.AGORA_TOKEN_EXPIRY_SECONDS ||
  '3600';
const jwtSecretFromEnv = process.env.JWT_SECRET || '';
const nodeEnvFromProcess = process.env.NODE_ENV || (process.env.K_SERVICE ? 'production' : 'development');
const defaultClientOrigin =
  nodeEnvFromProcess === 'production'
    ? ''
    : 'http://localhost:3000,http://localhost:5173';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default(nodeEnvFromProcess),
  PORT: z.coerce.number().default(8080),
  API_PREFIX: z.string().default('/api/v1'),
  CLIENT_ORIGIN: z.string().default(defaultClientOrigin),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  ENABLE_TEST_AUTH: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
  TEST_AUTH_FIXED_OTP: z.string().default(''),
  TEST_USER_PHONE: z.string().default(''),
  TEST_USER_PHONES: z.string().default(''),
  TEST_USER_NUMBERS: z.string().default(''),
  TEST_USER_DISPLAY_NAME: z.string().default('Test User'),
  TEST_LISTENER_PHONE: z.string().default(''),
  TEST_LISTENER_PHONES: z.string().default(''),
  TEST_LISTENER_NUMBERS: z.string().default(''),
  TEST_LISTENER_DISPLAY_NAME: z.string().default('Test Listener'),
  DEMO_OTP_MODE: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
  DEMO_OTP_CODE: z.string().default(''),
  DEMO_LOGIN_PHONE: z.string().default(''),
  DEMO_LOGIN_OTP: z.string().default(''),
  DEMO_USER_OTP_BYPASS: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
  DEMO_LISTENER_LOGIN_BYPASS: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),

  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay', 'stripe']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('webhook-secret'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  AGORA_APP_ID: z.string().default(''),
  AGORA_APP_CERTIFICATE: z.string().default(''),
  AGORA_TOKEN_EXPIRE_SECONDS: z.coerce.number().int().min(60).default(3600),
  AGORA_CHAT_APP_KEY: z.string().default(''),
  PUSH_NOTIFICATIONS_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true'),
  EXPO_PUSH_ACCESS_TOKEN: z.string().optional(),
  PROFILE_IMAGE_PUBLIC_BASE_URL: z.string().optional(),

  MIN_CHAT_START_BALANCE: z.coerce.number().default(20),
  MIN_CALL_START_BALANCE: z.coerce.number().default(30),
  LOW_BALANCE_MINUTES_THRESHOLD: z.coerce.number().default(2),
  APP_VERSION: z.string().default('2.0.0'),
});

const parsed = envSchema.safeParse({
  ...process.env,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || jwtSecretFromEnv,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || jwtSecretFromEnv,
  TEST_USER_PHONES: process.env.TEST_USER_PHONES || process.env.TEST_USER_NUMBERS || '',
  TEST_USER_NUMBERS: process.env.TEST_USER_NUMBERS || process.env.TEST_USER_PHONES || '',
  TEST_LISTENER_PHONES:
    process.env.TEST_LISTENER_PHONES || process.env.TEST_LISTENER_NUMBERS || '',
  TEST_LISTENER_NUMBERS:
    process.env.TEST_LISTENER_NUMBERS || process.env.TEST_LISTENER_PHONES || '',
  AGORA_TOKEN_EXPIRE_SECONDS: tokenExpireSecondsFromEnv,
});

if (!parsed.success) {
  const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${messages.join('\n')}`);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  const allowedOrigins = String(env.CLIENT_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!allowedOrigins.length) {
    throw new Error(
      'Missing CLIENT_ORIGIN for production. Set comma-separated trusted origins.'
    );
  }

  const hasLocalOrigin = allowedOrigins.some(
    (origin) => origin.includes('localhost') || origin.includes('127.0.0.1')
  );

  if (hasLocalOrigin) {
    throw new Error('CLIENT_ORIGIN must not include localhost or 127.0.0.1 in production.');
  }

  if (
    env.ENABLE_TEST_AUTH ||
    env.DEMO_OTP_MODE ||
    env.DEMO_USER_OTP_BYPASS ||
    env.DEMO_LISTENER_LOGIN_BYPASS
  ) {
    throw new Error('Test/demo auth shortcuts must be disabled in production.');
  }

  if (env.PAYMENT_PROVIDER === 'mock') {
    throw new Error('PAYMENT_PROVIDER=mock is not allowed in production.');
  }

  if (
    env.PAYMENT_PROVIDER === 'razorpay' &&
    (!String(env.RAZORPAY_KEY_ID || '').trim() || !String(env.RAZORPAY_KEY_SECRET || '').trim())
  ) {
    throw new Error(
      'Missing Razorpay configuration in production. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

  if (
    env.PAYMENT_PROVIDER === 'stripe' &&
    !String(env.STRIPE_SECRET_KEY || '').trim()
  ) {
    throw new Error('Missing Stripe configuration in production. Set STRIPE_SECRET_KEY.');
  }
}

if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
  throw new Error(
    'Missing Agora configuration. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE.'
  );
}

module.exports = { env };
