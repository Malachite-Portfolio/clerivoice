const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin@123', 10);
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

  const admin = await prisma.user.upsert({
    where: { phone: '+910000000001' },
    update: {
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
      email: 'admin25',
      displayName: 'Clarivoice Admin',
    },
    create: {
      phone: '+910000000001',
      email: 'admin25',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
      displayName: 'Clarivoice Admin',
      isPhoneVerified: true,
    },
  });

  const listenerUsers = [];
  for (const listenerSeed of seededListeners) {
    const listenerUser = await prisma.user.upsert({
      where: { phone: listenerSeed.phone },
      update: {
        role: 'LISTENER',
        status: 'ACTIVE',
        passwordHash,
        displayName: listenerSeed.displayName,
        isPhoneVerified: true,
      },
      create: {
        phone: listenerSeed.phone,
        role: 'LISTENER',
        status: 'ACTIVE',
        passwordHash,
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
