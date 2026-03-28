const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin@123', 10);

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

  const listenerUser = await prisma.user.upsert({
    where: { phone: '+910000000101' },
    update: {
      role: 'LISTENER',
      status: 'ACTIVE',
      passwordHash,
      displayName: 'Ananya Sharma',
    },
    create: {
      phone: '+910000000101',
      role: 'LISTENER',
      status: 'ACTIVE',
      passwordHash,
      displayName: 'Ananya Sharma',
      isPhoneVerified: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { phone: '+910000000201' },
    update: {
      role: 'USER',
      status: 'ACTIVE',
      displayName: 'Anonymous',
      isPhoneVerified: true,
    },
    create: {
      phone: '+910000000201',
      role: 'USER',
      status: 'ACTIVE',
      displayName: 'Anonymous',
      isPhoneVerified: true,
    },
  });

  await prisma.listenerProfile.upsert({
    where: { userId: listenerUser.id },
    update: {
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
    create: {
      userId: listenerUser.id,
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
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {
      balance: 397,
      currency: 'INR',
    },
    create: {
      userId: user.id,
      balance: 397,
      currency: 'INR',
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

  await prisma.referralCode.upsert({
    where: { userId: user.id },
    update: {
      code: 'D41M15',
      isActive: true,
    },
    create: {
      userId: user.id,
      code: 'D41M15',
      isActive: true,
    },
  });

  await prisma.referralCode.upsert({
    where: { userId: listenerUser.id },
    update: {
      code: 'ANAN55',
      isActive: true,
    },
    create: {
      userId: listenerUser.id,
      code: 'ANAN55',
      isActive: true,
    },
  });

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
