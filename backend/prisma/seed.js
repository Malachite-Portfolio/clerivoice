require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const requireSeedEnv = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`[seed] Missing required environment variable: ${name}`);
  }
  return value;
};

const getSeedEnv = (name, fallback = '') => {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
};

const parseBooleanEnv = (name, fallback = false) => {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  return value === 'true';
};

const normalizePhone = (phone) => {
  const input = String(phone || '').replace(/[\s()-]/g, '').trim();
  const digits = input.replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (input.startsWith('+')) {
    return `+${digits}`;
  }

  return input;
};

const buildPhoneFromEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('[seed] Cannot derive admin phone without ADMIN_EMAIL');
  }

  const hash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
  const numericSeed = Number.parseInt(hash.slice(0, 12), 16);
  const tenDigit = ((numericSeed % 9000000000) + 1000000000).toString();

  return `+91${tenDigit}`;
};

async function main() {
  const adminPhone = normalizePhone(getSeedEnv('ADMIN_PHONE'));
  const adminPassword = requireSeedEnv('ADMIN_PASSWORD');
  const adminEmail = getSeedEnv('ADMIN_EMAIL');
  const adminDisplayName = getSeedEnv('ADMIN_DISPLAY_NAME', 'Clarivoice Admin');
  const seedAdminOnly = getSeedEnv('SEED_ADMIN_ONLY').toLowerCase() === 'true';
  const disableLegacyDemoAdmins = parseBooleanEnv('ADMIN_DISABLE_LEGACY_DEMO', true);

  if (!adminPhone && !adminEmail) {
    throw new Error(
      '[seed] Provide at least one identifier for admin seed: ADMIN_EMAIL or ADMIN_PHONE'
    );
  }

  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const seedUserPasswordHash = await bcrypt.hash(getSeedEnv('SEED_USER_PASSWORD', 'Admin@123'), 10);
  const seededUsers = [
    {
      phone: '+910000000201',
      role: 'USER',
      displayName: 'Aarav Malhotra',
      walletBalance: 180,
      referralCode: 'D41M15',
      settings: true,
    },
    {
      phone: '+910000000202',
      role: 'USER',
      displayName: 'Siya Kapoor',
      walletBalance: 240,
      referralCode: 'AARV22',
      settings: true,
    },
    {
      phone: '+910000000203',
      role: 'USER',
      displayName: 'Rohan Verma',
      walletBalance: 300,
      referralCode: 'ROHN33',
      settings: true,
    },
    {
      phone: '+910000000204',
      role: 'USER',
      displayName: 'Naina Sharma',
      walletBalance: 360,
      referralCode: 'NAIN44',
      settings: true,
    },
    {
      phone: '+910000000205',
      role: 'USER',
      displayName: 'Kabir Mehta',
      walletBalance: 420,
      referralCode: 'KABR55',
      settings: true,
    },
    {
      phone: '+910000000206',
      role: 'USER',
      displayName: 'Ira Singh',
      walletBalance: 500,
      referralCode: 'IRAS66',
      settings: true,
    },
  ];
  const seededListeners = [
    {
      phone: '+910000000101',
      displayName: 'Ananya Sharma',
      referralCode: 'ANAN55',
      bio: 'Compassionate emotional support listener',
      rating: 4.9,
      experienceYears: 5,
      languages: ['Hindi', 'English'],
      category: 'Emotional Support',
      callRatePerMinute: 15,
      chatRatePerMinute: 10,
      availability: 'ONLINE',
      isEnabled: true,
    },
    {
      phone: '+910000000102',
      displayName: 'Kavya Mehra',
      referralCode: 'KAVY88',
      bio: 'Mindfulness and relationship support listener',
      rating: 4.8,
      experienceYears: 4,
      languages: ['Hindi', 'English'],
      category: 'Wellness Coaching',
      callRatePerMinute: 15,
      chatRatePerMinute: 10,
      availability: 'ONLINE',
      isEnabled: true,
    },
    {
      phone: '+910000000103',
      displayName: 'Ritika Sethi',
      referralCode: 'RITI77',
      bio: 'Empathetic listener for stress, work pressure, and personal growth',
      rating: 4.7,
      experienceYears: 6,
      languages: ['Hindi', 'English'],
      category: 'Stress Support',
      callRatePerMinute: 15,
      chatRatePerMinute: 10,
      availability: 'ONLINE',
      isEnabled: true,
    },
    {
      phone: '+910000000104',
      displayName: 'Meera Joshi',
      referralCode: 'MEER66',
      bio: 'Patient listener focused on relationship support and self-confidence',
      rating: 4.8,
      experienceYears: 5,
      languages: ['Hindi', 'English', 'Marathi'],
      category: 'Relationship Support',
      callRatePerMinute: 15,
      chatRatePerMinute: 10,
      availability: 'ONLINE',
      isEnabled: true,
    },
    {
      phone: '+910000000105',
      displayName: 'Sanya Arora',
      referralCode: 'SANY88',
      bio: 'Calm, non-judgmental support for anxiety and everyday overwhelm',
      rating: 4.9,
      experienceYears: 7,
      languages: ['Hindi', 'English', 'Punjabi'],
      category: 'Anxiety Support',
      callRatePerMinute: 15,
      chatRatePerMinute: 10,
      availability: 'ONLINE',
      isEnabled: true,
    },
    {
      phone: '+910000000106',
      displayName: 'Ishita Rao',
      referralCode: 'ISHI99',
      bio: 'Supportive listener for mindfulness, emotional balance, and motivation',
      rating: 4.8,
      experienceYears: 4,
      languages: ['Hindi', 'English', 'Telugu'],
      category: 'Mindfulness',
      callRatePerMinute: 15,
      chatRatePerMinute: 10,
      availability: 'ONLINE',
      isEnabled: true,
    },
  ];

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        ...(adminPhone ? [{ phone: adminPhone }] : []),
        ...(adminEmail ? [{ email: adminEmail }] : []),
      ],
    },
  });

  const adminCreatePhone = adminPhone || buildPhoneFromEmail(adminEmail);
  const adminUpdatePhone = adminPhone || existingAdmin?.phone || adminCreatePhone;

  const admin = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          phone: adminUpdatePhone,
          email: adminEmail || null,
          role: 'ADMIN',
          status: 'ACTIVE',
          passwordHash: adminPasswordHash,
          displayName: adminDisplayName,
          isPhoneVerified: true,
          deletedAt: null,
        },
      })
    : await prisma.user.create({
        data: {
          phone: adminCreatePhone,
          email: adminEmail || null,
          role: 'ADMIN',
          status: 'ACTIVE',
          passwordHash: adminPasswordHash,
          displayName: adminDisplayName,
          isPhoneVerified: true,
        },
      });

  if (disableLegacyDemoAdmins) {
    const legacyDemoAdminResult = await prisma.user.updateMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        id: { not: admin.id },
        OR: [{ email: 'admin25' }, { phone: '+910000000001' }],
      },
      data: {
        status: 'BLOCKED',
        blockedReason: 'Legacy demo admin disabled',
      },
    });

    if (legacyDemoAdminResult.count > 0) {
      console.log(`[seed] Disabled ${legacyDemoAdminResult.count} legacy demo admin account(s).`);
    }
  }

  if (seedAdminOnly) {
    console.log('[seed] Admin-only seeding complete.');
    return;
  }

  const listenerUsers = [];
  for (const listenerSeed of seededListeners) {
    const listenerUser = await prisma.user.upsert({
      where: { phone: listenerSeed.phone },
      update: {
        role: 'LISTENER',
        status: 'ACTIVE',
        passwordHash: seedUserPasswordHash,
        displayName: listenerSeed.displayName,
        isPhoneVerified: true,
      },
      create: {
        phone: listenerSeed.phone,
        role: 'LISTENER',
        status: 'ACTIVE',
        passwordHash: seedUserPasswordHash,
        displayName: listenerSeed.displayName,
        isPhoneVerified: true,
      },
    });

    await prisma.listenerProfile.upsert({
      where: { userId: listenerUser.id },
      update: {
        bio: listenerSeed.bio,
        rating: listenerSeed.rating,
        experienceYears: listenerSeed.experienceYears,
        languages: listenerSeed.languages,
        category: listenerSeed.category,
        callRatePerMinute: listenerSeed.callRatePerMinute,
        chatRatePerMinute: listenerSeed.chatRatePerMinute,
        availability: listenerSeed.availability,
        isEnabled: listenerSeed.isEnabled,
      },
      create: {
        userId: listenerUser.id,
        bio: listenerSeed.bio,
        rating: listenerSeed.rating,
        experienceYears: listenerSeed.experienceYears,
        languages: listenerSeed.languages,
        category: listenerSeed.category,
        callRatePerMinute: listenerSeed.callRatePerMinute,
        chatRatePerMinute: listenerSeed.chatRatePerMinute,
        availability: listenerSeed.availability,
        isEnabled: listenerSeed.isEnabled,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: listenerUser.id },
      update: {
        balance: 0,
        currency: 'INR',
      },
      create: {
        userId: listenerUser.id,
        balance: 0,
        currency: 'INR',
      },
    });

    await prisma.referralCode.upsert({
      where: { userId: listenerUser.id },
      update: {
        code: listenerSeed.referralCode,
        isActive: true,
      },
      create: {
        userId: listenerUser.id,
        code: listenerSeed.referralCode,
        isActive: true,
      },
    });

    listenerUsers.push(listenerUser);
  }

  const userRecords = [];
  for (const userSeed of seededUsers) {
    const user = await prisma.user.upsert({
      where: { phone: userSeed.phone },
      update: {
        role: 'USER',
        status: 'ACTIVE',
        displayName: userSeed.displayName,
        isPhoneVerified: true,
      },
      create: {
        phone: userSeed.phone,
        role: 'USER',
        status: 'ACTIVE',
        displayName: userSeed.displayName,
        isPhoneVerified: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {
        balance: userSeed.walletBalance,
        currency: 'INR',
      },
      create: {
        userId: user.id,
        balance: userSeed.walletBalance,
        currency: 'INR',
      },
    });

    await prisma.referralCode.upsert({
      where: { userId: user.id },
      update: {
        code: userSeed.referralCode,
        isActive: true,
      },
      create: {
        userId: user.id,
        code: userSeed.referralCode,
        isActive: true,
      },
    });

    if (userSeed.settings) {
      await prisma.userSetting.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          anonymousMode: true,
          allowPush: true,
          allowSms: true,
          language: 'en',
        },
      });
    }

    userRecords.push(user);
  }

  await prisma.wallet.upsert({
    where: { userId: admin.id },
    update: {
      balance: 0,
      currency: 'INR',
    },
    create: {
      userId: admin.id,
      balance: 0,
      currency: 'INR',
    },
  });

  const plans = [
    { amount: 159, talktime: 159, sortOrder: 1 },
    { amount: 249, talktime: 249, sortOrder: 2 },
    { amount: 449, talktime: 449, sortOrder: 3 },
  ];

  for (const plan of plans) {
    await prisma.rechargePlan.upsert({
      where: {
        id: plan.sortOrder,
      },
      update: {
        amount: plan.amount,
        talktime: plan.talktime,
        status: 'ACTIVE',
        sortOrder: plan.sortOrder,
      },
      create: {
        id: plan.sortOrder,
        amount: plan.amount,
        talktime: plan.talktime,
        status: 'ACTIVE',
        sortOrder: plan.sortOrder,
        label: `?${plan.amount}`,
      },
    });
  }

  await prisma.coupon.upsert({
    where: { code: 'FLAT200' },
    update: {
      description: '?200 off on recharge',
      discountType: 'FIXED',
      discountValue: 200,
      minAmount: 199,
      maxDiscount: 200,
      isActive: true,
    },
    create: {
      code: 'FLAT200',
      description: '?200 off on recharge',
      discountType: 'FIXED',
      discountValue: 200,
      minAmount: 199,
      maxDiscount: 200,
      isActive: true,
    },
  });

  await prisma.referralRewardRule.upsert({
    where: { name: 'default_referral_rule' },
    update: {
      inviterReward: 55,
      referredReward: 50,
      qualifyingAmount: 500,
      isActive: true,
    },
    create: {
      name: 'default_referral_rule',
      inviterReward: 55,
      referredReward: 50,
      qualifyingAmount: 500,
      isActive: true,
    },
  });

  await prisma.appConfig.upsert({
    where: { key: 'billing_rules' },
    update: {
      value: {
        minChatStartBalance: 20,
        minCallStartBalance: 30,
        lowBalanceMinutesThreshold: 2,
      },
      description: 'Minimum balance and low-balance warning configuration.',
    },
    create: {
      key: 'billing_rules',
      value: {
        minChatStartBalance: 20,
        minCallStartBalance: 30,
        lowBalanceMinutesThreshold: 2,
      },
      description: 'Minimum balance and low-balance warning configuration.',
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
