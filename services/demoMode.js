const DEMO_USER_ID = 'demo-user-1';
const DEMO_USER_TOKEN = 'demo-user-token';
const DEMO_REFRESH_TOKEN = 'demo-user-refresh-token';
const DEMO_REFERRAL_CODE = 'CLARIDEV';

const toIso = (date = new Date()) => date.toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const minutesAgo = (count) => new Date(Date.now() - count * 60 * 1000);
const hoursAgo = (count) => new Date(Date.now() - count * 60 * 60 * 1000);
const daysAgo = (count) => new Date(Date.now() - count * 24 * 60 * 60 * 1000);

const demoHosts = [
  {
    userId: 'demo-listener-1',
    user: {
      id: 'demo-listener-1',
      displayName: 'Mahi',
      profileImageUrl: null,
      status: 'ACTIVE',
    },
    bio: 'A calm listener for late-night chats and voice calls.',
    availability: 'ONLINE',
    isVisible: true,
    isEnabled: true,
    visibility: 'VISIBLE',
    verificationStatus: 'VERIFIED',
    experienceYears: 4,
    rating: 4.9,
    callRatePerMinute: 20,
    chatRatePerMinute: 12,
  },
  {
    userId: 'demo-listener-2',
    user: {
      id: 'demo-listener-2',
      displayName: 'Aarohi',
      profileImageUrl: null,
      status: 'ACTIVE',
    },
    bio: 'Gentle, grounded support for work stress and overwhelm.',
    availability: 'ONLINE',
    isVisible: true,
    isEnabled: true,
    visibility: 'VISIBLE',
    verificationStatus: 'VERIFIED',
    experienceYears: 6,
    rating: 4.8,
    callRatePerMinute: 24,
    chatRatePerMinute: 14,
  },
  {
    userId: 'demo-listener-3',
    user: {
      id: 'demo-listener-3',
      displayName: 'Riya',
      profileImageUrl: null,
      status: 'ACTIVE',
    },
    bio: 'Encouraging voice support with a warm, practical style.',
    availability: 'ONLINE',
    isVisible: true,
    isEnabled: true,
    visibility: 'VISIBLE',
    verificationStatus: 'VERIFIED',
    experienceYears: 3,
    rating: 4.7,
    callRatePerMinute: 18,
    chatRatePerMinute: 10,
  },
];

const demoPlans = [
  { id: 'demo-plan-159', planId: 159, amount: 159, talktime: 159, label: 'Starter' },
  { id: 'demo-plan-249', planId: 249, amount: 249, talktime: 279, label: 'Popular' },
  { id: 'demo-plan-449', planId: 449, amount: 449, talktime: 520, label: 'Best Value' },
];

const createDemoUserProfile = () => ({
  id: DEMO_USER_ID,
  displayName: 'Demo User',
  phone: '+919876543210',
  role: 'USER',
  status: 'ACTIVE',
});

const buildListenerParticipant = (host) => ({
  id: host.userId,
  displayName: host.user?.displayName || 'Support Host',
  profileImageUrl: host.user?.profileImageUrl || null,
});

const buildChatSessionFromHost = (host, overrides = {}) => {
  const now = new Date();
  const startedAt = overrides.startedAt || now;
  const requestedAt = overrides.requestedAt || startedAt;

  return {
    id: overrides.id || makeId('demo-chat'),
    userId: DEMO_USER_ID,
    listenerId: host.userId,
    status: overrides.status || 'ACTIVE',
    createdAt: toIso(overrides.createdAt || requestedAt),
    requestedAt: toIso(requestedAt),
    startedAt: toIso(startedAt),
    updatedAt: toIso(overrides.updatedAt || now),
    endedAt: overrides.endedAt ? toIso(overrides.endedAt) : null,
    endReason: overrides.endReason || null,
    listener: buildListenerParticipant(host),
    user: createDemoUserProfile(),
  };
};

const buildCallSessionFromHost = (host, overrides = {}) => {
  const now = new Date();
  const requestedAt = overrides.requestedAt || now;
  const startedAt = overrides.startedAt || null;

  return {
    id: overrides.id || makeId('demo-call'),
    userId: DEMO_USER_ID,
    listenerId: host.userId,
    status: overrides.status || 'REQUESTED',
    createdAt: toIso(overrides.createdAt || requestedAt),
    requestedAt: toIso(requestedAt),
    startedAt: startedAt ? toIso(startedAt) : null,
    answeredAt: overrides.answeredAt ? toIso(overrides.answeredAt) : startedAt ? toIso(startedAt) : null,
    updatedAt: toIso(overrides.updatedAt || now),
    endedAt: overrides.endedAt ? toIso(overrides.endedAt) : null,
    endReason: overrides.endReason || null,
    channelName: overrides.channelName || `demo-call-${host.userId}`,
    listener: buildListenerParticipant(host),
    user: createDemoUserProfile(),
  };
};

const buildMessage = ({
  id,
  sessionId,
  senderId,
  receiverId,
  content,
  status = 'DELIVERED',
  createdAt = new Date(),
  readAt = null,
}) => ({
  id: id || makeId('demo-message'),
  sessionId,
  senderId,
  receiverId,
  content,
  messageType: 'text',
  status,
  createdAt: toIso(createdAt),
  readAt: readAt ? toIso(readAt) : null,
});

const createInitialDemoState = () => {
  const firstHost = demoHosts[0];
  const secondHost = demoHosts[1];

  const seededChatSession = buildChatSessionFromHost(firstHost, {
    id: 'demo-chat-seeded',
    startedAt: minutesAgo(15),
    updatedAt: minutesAgo(1),
  });

  const seededCallSession = buildCallSessionFromHost(secondHost, {
    id: 'demo-call-seeded',
    status: 'ENDED',
    requestedAt: hoursAgo(4),
    startedAt: hoursAgo(4),
    endedAt: hoursAgo(4 - 0.1),
    updatedAt: hoursAgo(4 - 0.1),
    endReason: 'USER_ENDED',
  });

  const seededMessages = [
    buildMessage({
      id: 'demo-message-1',
      sessionId: seededChatSession.id,
      senderId: firstHost.userId,
      receiverId: DEMO_USER_ID,
      content: 'Hi, I am here whenever you want to talk.',
      status: 'READ',
      createdAt: minutesAgo(14),
      readAt: minutesAgo(14),
    }),
    buildMessage({
      id: 'demo-message-2',
      sessionId: seededChatSession.id,
      senderId: DEMO_USER_ID,
      receiverId: firstHost.userId,
      content: 'Thank you. I wanted to try the chat flow before going live.',
      status: 'READ',
      createdAt: minutesAgo(13),
      readAt: minutesAgo(13),
    }),
    buildMessage({
      id: 'demo-message-3',
      sessionId: seededChatSession.id,
      senderId: firstHost.userId,
      receiverId: DEMO_USER_ID,
      content: 'Perfect. Demo mode keeps everything local so you can explore safely.',
      status: 'DELIVERED',
      createdAt: minutesAgo(1),
    }),
  ];

  return {
    hosts: clone(demoHosts),
    walletSummary: {
      balance: 397,
      totalRecharged: 1499,
      referralEarned: 110,
      plans: demoPlans.map((plan) => plan.amount),
    },
    walletPlans: clone(demoPlans),
    walletHistory: [
      {
        id: 'demo-wallet-history-1',
        type: 'RECHARGE',
        amount: 449,
        description: 'Demo starter recharge',
        createdAt: toIso(daysAgo(2)),
      },
      {
        id: 'demo-wallet-history-2',
        type: 'REFERRAL_BONUS',
        amount: 110,
        description: 'Referral reward credited',
        createdAt: toIso(daysAgo(1)),
      },
      {
        id: 'demo-wallet-history-3',
        type: 'CHAT_DEBIT',
        amount: 48,
        description: 'Demo chat usage',
        createdAt: toIso(hoursAgo(8)),
      },
    ],
    referralInfo: {
      referralCode: DEMO_REFERRAL_CODE,
      rewardDescription: 'Invite friends and earn wallet credits after their first recharge.',
      friendRewardDescription: 'Your friend gets an instant wallet bonus after signup.',
      inviterReward: 55,
      referredReward: 50,
      totalEarned: 110,
      qualifyingAmount: 500,
      sharePayload: {
        title: 'Join Clarivoice',
        message: `Use my referral code ${DEMO_REFERRAL_CODE} on Clarivoice and unlock wallet rewards.`,
      },
      referrals: [{ id: 'demo-referral-1', friendName: 'Anaya', amount: 110 }],
    },
    referralHistory: {
      inviterHistory: [
        {
          id: 'demo-referral-history-1',
          friendName: 'Anaya',
          status: 'REWARDED',
          amount: 110,
          createdAt: toIso(daysAgo(1)),
        },
      ],
    },
    referralFaq: [
      {
        question: 'When do referral rewards unlock?',
        answer: 'Rewards unlock after your friend signs up and completes the qualifying recharge.',
      },
      {
        question: 'Can I invite multiple friends?',
        answer: 'Yes. Every eligible referral can add another wallet reward to your account.',
      },
      {
        question: 'Can I use referral rewards for calls and chats?',
        answer: 'Yes. Referral credits behave like wallet balance inside the app.',
      },
    ],
    ordersById: {},
    chatSessions: [seededChatSession],
    callSessions: [seededCallSession],
    messagesBySessionId: {
      [seededChatSession.id]: seededMessages,
    },
  };
};

let activeDemoSession = null;
let demoState = createInitialDemoState();

export const resetDemoState = () => {
  demoState = createInitialDemoState();
};

const getState = () => {
  if (!demoState) {
    demoState = createInitialDemoState();
  }

  return demoState;
};

const findHostById = (listenerId) =>
  getState().hosts.find((host) => String(host.userId) === String(listenerId)) || getState().hosts[0];

const updateChatSessionTimestamp = (sessionId, patch = {}) => {
  const state = getState();
  state.chatSessions = state.chatSessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          ...patch,
          updatedAt: toIso(new Date()),
        }
      : session,
  );
};

const updateCallSessionTimestamp = (sessionId, patch = {}) => {
  const state = getState();
  state.callSessions = state.callSessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          ...patch,
          updatedAt: toIso(new Date()),
        }
      : session,
  );
};

export const createDemoUserSession = () => ({
  user: createDemoUserProfile(),
  accessToken: DEMO_USER_TOKEN,
  refreshToken: DEMO_REFRESH_TOKEN,
  isDemoUser: true,
});

export const setDemoSessionActive = (active, session = null) => {
  if (!active) {
    activeDemoSession = null;
    return;
  }

  resetDemoState();
  activeDemoSession = session ? clone(session) : createDemoUserSession();
};

export const isDemoSessionActive = () => Boolean(activeDemoSession?.isDemoUser);

export const getDemoSession = () => (activeDemoSession ? clone(activeDemoSession) : null);

export const getDemoHosts = async ({ page = 1, limit = 20 } = {}) => {
  const state = getState();
  const items = state.hosts.slice(0, limit);

  return {
    items: clone(items),
    page,
    limit,
    total: state.hosts.length,
    hasMore: state.hosts.length > limit,
  };
};

export const getDemoHostAvailability = async (listenerId) => {
  const host = findHostById(listenerId);

  return {
    listenerId: host.userId,
    availability: host.availability,
    isVisible: host.isVisible,
    isEnabled: host.isEnabled,
    message: `${host.user?.displayName || 'This host'} is available in demo mode.`,
  };
};

export const createDemoChatRequest = async (listenerId) => {
  const state = getState();
  const existingSession = state.chatSessions.find(
    (session) => session.listenerId === listenerId && session.status !== 'ENDED',
  );

  if (existingSession) {
    return {
      session: clone(existingSession),
      agora: null,
      demoMode: true,
    };
  }

  const host = findHostById(listenerId);
  const session = buildChatSessionFromHost(host, {
    status: 'ACTIVE',
    startedAt: new Date(),
  });

  state.chatSessions.unshift(session);
  state.messagesBySessionId[session.id] = [
    buildMessage({
      sessionId: session.id,
      senderId: host.userId,
      receiverId: DEMO_USER_ID,
      content: `Hi, I am ${host.user?.displayName || 'your demo host'}. This is a local demo chat session.`,
      status: 'DELIVERED',
    }),
  ];

  return {
    session: clone(session),
    agora: null,
    demoMode: true,
  };
};

export const createDemoCallRequest = async (listenerId) => {
  const state = getState();
  const host = findHostById(listenerId);
  const session = buildCallSessionFromHost(host, {
    status: 'ACTIVE',
    startedAt: new Date(),
  });

  state.callSessions.unshift(session);

  return {
    session: clone(session),
    agora: null,
    demoMode: true,
  };
};

export const getDemoChatMessages = async (sessionId) => {
  const state = getState();
  const session = state.chatSessions.find((item) => item.id === sessionId) || null;

  return {
    session: clone(session),
    messages: clone(state.messagesBySessionId[sessionId] || []),
  };
};

export const getDemoChatSessions = async ({ page = 1, limit = 10, status } = {}) => {
  const state = getState();
  const items = state.chatSessions
    .filter((session) => (!status ? true : String(session.status).toUpperCase() === String(status).toUpperCase()))
    .slice(0, limit);

  return {
    items: clone(items),
    page,
    limit,
    total: state.chatSessions.length,
    hasMore: state.chatSessions.length > limit,
  };
};

export const getDemoCallSessions = async ({ page = 1, limit = 10 } = {}) => {
  const state = getState();
  const items = state.callSessions.slice(0, limit);

  return {
    items: clone(items),
    page,
    limit,
    total: state.callSessions.length,
    hasMore: state.callSessions.length > limit,
  };
};

export const addDemoChatMessage = async (
  sessionId,
  { senderId, receiverId, content, status = 'DELIVERED' },
) => {
  const state = getState();
  const message = buildMessage({
    sessionId,
    senderId,
    receiverId,
    content,
    status,
  });

  if (!state.messagesBySessionId[sessionId]) {
    state.messagesBySessionId[sessionId] = [];
  }

  state.messagesBySessionId[sessionId].push(message);
  updateChatSessionTimestamp(sessionId, { status: 'ACTIVE' });

  return clone(message);
};

export const addDemoChatReply = async (sessionId, content) => {
  const state = getState();
  const session = state.chatSessions.find((item) => item.id === sessionId);
  const listenerId = session?.listenerId || demoHosts[0].userId;

  return addDemoChatMessage(sessionId, {
    senderId: listenerId,
    receiverId: DEMO_USER_ID,
    content,
    status: 'DELIVERED',
  });
};

export const endDemoChatSession = async (sessionId, endReason = 'USER_ENDED') => {
  updateChatSessionTimestamp(sessionId, {
    status: 'ENDED',
    endedAt: toIso(new Date()),
    endReason,
  });

  const state = getState();
  return clone(state.chatSessions.find((session) => session.id === sessionId) || null);
};

export const endDemoCallSession = async (sessionId, endReason = 'USER_ENDED') => {
  updateCallSessionTimestamp(sessionId, {
    status: 'ENDED',
    endedAt: toIso(new Date()),
    endReason,
  });

  const state = getState();
  return clone(state.callSessions.find((session) => session.id === sessionId) || null);
};

export const getDemoWalletSummary = async () => clone(getState().walletSummary);

export const getDemoWalletPlans = async () => clone(getState().walletPlans);

export const getDemoWalletHistory = async ({ page = 1, limit = 20, type } = {}) => {
  const state = getState();
  const filtered = type
    ? state.walletHistory.filter(
        (item) => String(item.type).toUpperCase() === String(type).toUpperCase(),
      )
    : state.walletHistory;

  return {
    items: clone(filtered.slice(0, limit)),
    page,
    limit,
    total: filtered.length,
    hasMore: filtered.length > limit,
  };
};

export const applyDemoWalletCoupon = async ({ couponCode, amount }) => {
  const normalizedCode = String(couponCode || '').trim().toUpperCase();
  const numericAmount = Number(amount || 0);

  if (normalizedCode !== 'FLAT200') {
    return {
      valid: false,
      reason: 'Only FLAT200 is enabled in demo mode.',
      discountAmount: 0,
      payableAmount: numericAmount,
      coupon: null,
    };
  }

  if (numericAmount < 199) {
    return {
      valid: false,
      reason: 'FLAT200 works on recharge amounts of INR 199 or more.',
      discountAmount: 0,
      payableAmount: numericAmount,
      coupon: null,
    };
  }

  const discountAmount = Math.min(200, numericAmount);

  return {
    valid: true,
    discountAmount,
    payableAmount: Math.max(numericAmount - discountAmount, 0),
    coupon: {
      code: normalizedCode,
      description: 'Flat INR 200 off in demo mode',
    },
  };
};

export const createDemoWalletOrder = async ({
  planId,
  amount,
  couponCode,
  paymentMethod,
  metadata,
} = {}) => {
  const state = getState();
  const selectedPlan =
    state.walletPlans.find((plan) => String(plan.planId) === String(planId)) || null;
  const rechargeAmount = Number(selectedPlan?.amount || amount || 0);

  if (!rechargeAmount) {
    throw new Error('Choose a recharge amount first.');
  }

  const couponResult = couponCode
    ? await applyDemoWalletCoupon({ couponCode, amount: rechargeAmount })
    : null;

  const order = {
    orderId: makeId('demo-order'),
    provider: 'MOCK',
    planId: selectedPlan?.planId || null,
    amount: rechargeAmount,
    payableAmount: couponResult?.valid ? couponResult.payableAmount : rechargeAmount,
    couponCode: couponResult?.valid ? couponResult.coupon.code : null,
    paymentMethod: paymentMethod || 'UPI',
    metadata: metadata || null,
    createdAt: toIso(new Date()),
  };

  state.ordersById[order.orderId] = order;
  return clone(order);
};

export const verifyDemoWalletPayment = async ({
  orderId,
  gatewayPaymentId,
  method,
  metadata,
}) => {
  const state = getState();
  const order = state.ordersById[orderId];

  if (!order) {
    throw new Error('Demo recharge order could not be found.');
  }

  state.walletSummary.balance += Number(order.amount || 0);
  state.walletSummary.totalRecharged += Number(order.amount || 0);

  const transaction = {
    id: makeId('demo-wallet-history'),
    type: 'RECHARGE',
    amount: Number(order.amount || 0),
    description: `Demo recharge via ${method || order.paymentMethod || 'UPI'}`,
    createdAt: toIso(new Date()),
    gatewayPaymentId: gatewayPaymentId || null,
    metadata: metadata || null,
  };

  state.walletHistory.unshift(transaction);

  return {
    walletSummary: clone(state.walletSummary),
    transaction: clone(transaction),
  };
};

export const getDemoReferralInfo = async () => clone(getState().referralInfo);

export const getDemoReferralHistory = async () => clone(getState().referralHistory);

export const getDemoReferralFaq = async () => clone(getState().referralFaq);
