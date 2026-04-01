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
  purpose: z.enum(['LOGIN', 'SIGNUP', 'VERIFY_PHONE']).default('LOGIN'),
  displayName: z.string().min(2).max(80).optional(),
  referralCode: z.string().max(20).optional(),
  deviceId: z.string().max(200).optional(),
  deviceInfo: z.record(z.any()).optional(),
});

const loginUserSchema = verifyOtpSchema;
const listenerSendOtpSchema = sendOtpSchema;
const listenerVerifyOtpSchema = verifyOtpSchema;

const loginSchema = z
  .object({
    phoneOrEmail: z.string().min(4).optional(),
    phone: z.string().min(7).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).max(120),
    deviceId: z.string().max(200).optional(),
    deviceInfo: z.record(z.any()).optional(),
  })
  .superRefine((value, ctx) => {
    const identity = value.phoneOrEmail || value.phone || value.email;

    if (!identity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide one of: phoneOrEmail, phone, or email',
        path: ['phoneOrEmail'],
      });
    }
  })
  .transform((value) => ({
    phoneOrEmail: value.phoneOrEmail || value.phone || value.email,
    password: value.password,
    deviceId: value.deviceId,
    deviceInfo: value.deviceInfo,
  }));

const loginListenerSchema = z
  .object({
    listenerId: z.string().min(3).optional(),
    phoneOrEmail: z.string().min(4).optional(),
    phone: z.string().min(7).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).max(120),
    deviceId: z.string().max(200).optional(),
    deviceInfo: z.record(z.any()).optional(),
  })
  .superRefine((value, ctx) => {
    const identity = value.listenerId || value.phoneOrEmail || value.phone || value.email;
    if (!identity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide one of: listenerId, phoneOrEmail, phone, or email',
        path: ['listenerId'],
      });
    }
  })
  .transform((value) => ({
    listenerIdentity: value.listenerId || value.phoneOrEmail || value.phone || value.email,
    password: value.password,
    deviceId: value.deviceId,
    deviceInfo: value.deviceInfo,
  }));

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

module.exports = {
  sendOtpSchema,
  verifyOtpSchema,
  loginUserSchema,
  listenerSendOtpSchema,
  listenerVerifyOtpSchema,
  loginSchema,
  loginListenerSchema,
  refreshSchema,
  logoutSchema,
};
