const { z } = require('zod');

const registerPushDeviceSchema = z.object({
  expoPushToken: z
    .string()
    .min(10)
    .refine(
      (value) =>
        String(value).startsWith('ExponentPushToken[') ||
        String(value).startsWith('ExpoPushToken['),
      'Invalid Expo push token'
    ),
  appFlavor: z.enum(['user', 'listener']),
  platform: z.string().default('android'),
  deviceId: z.string().max(200).optional(),
  deviceName: z.string().max(200).optional(),
  deviceInfo: z.record(z.any()).optional(),
});

const unregisterPushDeviceSchema = z.object({
  expoPushToken: z.string().min(10),
});

module.exports = {
  registerPushDeviceSchema,
  unregisterPushDeviceSchema,
};
