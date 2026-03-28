const { config } = require('dotenv');
const { z } = require('zod');

config();

const tokenExpireSecondsFromEnv =
  process.env.AGORA_TOKEN_EXPIRE_SECONDS ||
  process.env.AGORA_TOKEN_EXPIRY_SECONDS ||
  '3600';
const jwtSecretFromEnv = process.env.JWT_SECRET || '';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000,http://localhost:19006'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  DEMO_OTP_MODE: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
  DEMO_OTP_CODE: z.string().default('123456'),
  DEMO_LOGIN_PHONE: z.string().default('+916386361769'),
  DEMO_LOGIN_OTP: z.string().default('123456'),

  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay', 'stripe']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('webhook-secret'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  AGORA_APP_ID: z.string().default(''),
  AGORA_APP_CERTIFICATE: z.string().default(''),
  AGORA_TOKEN_EXPIRE_SECONDS: z.coerce.number().int().min(60).default(3600),
  AGORA_CHAT_APP_KEY: z.string().default(''),

  MIN_CHAT_START_BALANCE: z.coerce.number().default(20),
  MIN_CALL_START_BALANCE: z.coerce.number().default(30),
  LOW_BALANCE_MINUTES_THRESHOLD: z.coerce.number().default(2),
  APP_VERSION: z.string().default('2.0.0'),
});

const parsed = envSchema.safeParse({
  ...process.env,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || jwtSecretFromEnv,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || jwtSecretFromEnv,
  AGORA_TOKEN_EXPIRE_SECONDS: tokenExpireSecondsFromEnv,
});

if (!parsed.success) {
  const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${messages.join('\n')}`);
}

const env = parsed.data;

if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
  throw new Error(
    'Missing Agora configuration. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE.'
  );
}

module.exports = { env };
