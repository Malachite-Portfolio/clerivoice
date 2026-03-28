const { z } = require('zod');

const phoneSchema = z
  .string()
  .regex(/^\+?\d{10,15}$/, 'Invalid phone number format');

const sendOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['LOGIN', 'SIGNUP', 'VERIFY_PHONE']).default('LOGIN'),
});

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(/^\d{4,6}$/, 'Invalid OTP format'),
  displayName: z.string().min(2).max(80).optional(),
  referralCode: z.string().max(20).optional(),
  deviceId: z.string().max(200).optional(),
  deviceInfo: z.record(z.any()).optional(),
});

const loginSchema = z.object({
  phoneOrEmail: z.string().min(4),
  password: z.string().min(6).max(120),
  deviceId: z.string().max(200).optional(),
  deviceInfo: z.record(z.any()).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

module.exports = {
  sendOtpSchema,
  verifyOtpSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
};
