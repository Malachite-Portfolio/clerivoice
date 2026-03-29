import type {
  DashboardSummary,
  Host,
  LiveSession,
  ReferralRecord,
  RevenuePoint,
  SupportTicket,
  TopEarningHost,
  User,
  WalletOverview,
  WalletTransaction,
} from "@/types";

export const mockDashboardSummary: DashboardSummary = {
  totalUsers: 24182,
  totalHosts: 467,
  activeHosts: 312,
  liveCallsNow: 43,
  liveChatsNow: 88,
  rechargeToday: 384500,
  revenueToday: 219700,
  pendingHostApprovals: 17,
};

export const mockRevenueSeries: RevenuePoint[] = [
  { label: "Mon", revenue: 182000, recharge: 285000, callMinutes: 5300, chatSessions: 840 },
  { label: "Tue", revenue: 196500, recharge: 301200, callMinutes: 5590, chatSessions: 875 },
  { label: "Wed", revenue: 174200, recharge: 279900, callMinutes: 5100, chatSessions: 801 },
  { label: "Thu", revenue: 205400, recharge: 319100, callMinutes: 5820, chatSessions: 903 },
  { label: "Fri", revenue: 221700, recharge: 342600, callMinutes: 6140, chatSessions: 957 },
  { label: "Sat", revenue: 239400, recharge: 367500, callMinutes: 6650, chatSessions: 1048 },
  { label: "Sun", revenue: 219700, recharge: 384500, callMinutes: 6410, chatSessions: 996 },
];

export const mockTopHosts: TopEarningHost[] = [
  { hostName: "Ananya", amount: 98400 },
  { hostName: "Nikhil", amount: 90200 },
  { hostName: "Aarohi", amount: 86300 },
  { hostName: "Mihir", amount: 81200 },
  { hostName: "Ira", amount: 77900 },
];

export const mockHosts: Host[] = Array.from({ length: 12 }).map((_, index) => ({
  id: `host_${index + 1}`,
  hostId: `CLH${1000 + index}`,
  fullName: `Host ${index + 1} Sharma`,
  displayName: ["Ananya", "Ritika", "Neha", "Prerna", "Amit", "Ira"][index % 6],
  phone: `+91 90000${(index + 10000).toString().slice(-5)}`,
  email: `host${index + 1}@clarivoice.in`,
  gender: index % 2 === 0 ? "female" : "male",
  age: 24 + (index % 12),
  category: ["Anxiety", "Relationship", "Career", "Family"][index % 4],
  languages: ["English", "Hindi", index % 2 ? "Marathi" : "Tamil"],
  experienceYears: 2 + (index % 8),
  rating: 4.2 + (index % 7) * 0.1,
  reviewsCount: 112 + index * 5,
  quote: "Holding space for your healing journey.",
  bio: "Compassionate listener focused on emotional support and mindful conversations.",
  skills: ["Empathy", "Active listening", "Mindfulness"],
  callRatePerMinute: 15 + (index % 5) * 2,
  chatRatePerMinute: 12 + (index % 5),
  minChatBalance: 20,
  minCallBalance: 30,
  totalCalls: 80 + index * 7,
  totalChats: 150 + index * 8,
  totalMinutes: 1200 + index * 90,
  completedSessions: 210 + index * 14,
  cancellationRate: 2 + (index % 4),
  revenueGenerated: 110000 + index * 6500,
  hostEarnings: 82000 + index * 5200,
  platformCommission: 28000 + index * 1300,
  status: index % 7 === 0 ? "inactive" : "active",
  verificationStatus:
    index % 8 === 0 ? "pending" : index % 5 === 0 ? "rejected" : "verified",
  visibility: index % 6 === 0 ? "hidden" : "visible",
  presence: index % 4 === 0 ? "busy" : index % 3 === 0 ? "offline" : "online",
  featured: index % 5 === 0,
  blockedNewSessions: false,
  joinedAt: new Date(Date.now() - index * 86400000 * 7).toISOString(),
  profileImageUrl: undefined,
  availabilitySchedule: "10:00 AM - 10:00 PM",
  adminNotes: "",
}));

export const mockUsers: User[] = Array.from({ length: 16 }).map((_, index) => ({
  id: `user_${index + 1}`,
  name: `User ${index + 1}`,
  phone: `+91 81234${(index + 10000).toString().slice(-5)}`,
  email: `user${index + 1}@mail.com`,
  referralCode: `CLV${1000 + index}`,
  walletBalance: 120 + index * 15,
  totalRecharge: 500 + index * 50,
  totalSpent: 280 + index * 30,
  status: index % 9 === 0 ? "suspended" : "active",
  joinedAt: new Date(Date.now() - index * 86400000 * 4).toISOString(),
}));

export const mockLiveSessions: LiveSession[] = Array.from({ length: 7 }).map(
  (_, index) => ({
    id: `session_${index + 1}`,
    type: index % 2 === 0 ? "call" : "chat",
    userName: `User ${index + 1}`,
    hostName: `Host ${index + 1}`,
    startTime: new Date(Date.now() - index * 420000).toISOString(),
    runningDurationSeconds: 310 + index * 77,
    currentBilling: 82 + index * 18,
    status: index % 5 === 0 ? "ringing" : "active",
  }),
);

export const mockWalletOverview: WalletOverview = {
  totalRechargeVolume: 9483000,
  pendingPayments: 34,
  successfulPayments: 29842,
  failedPayments: 628,
  refunds: 71,
  couponUsage: 4145,
};

export const mockWalletTransactions: WalletTransaction[] = Array.from(
  { length: 14 },
  (_, index) => ({
    id: `txn_${index + 1}`,
    userName: `User ${index + 1}`,
    userId: `user_${index + 1}`,
    type: ["recharge", "call_debit", "chat_debit", "referral_bonus"][index % 4] as WalletTransaction["type"],
    amount: 100 + index * 50,
    status: "success",
    balanceBefore: 500 + index * 25,
    balanceAfter: 600 + index * 20,
    paymentMethod: index % 2 ? "UPI" : "Card",
    createdAt: new Date(Date.now() - index * 3600000 * 9).toISOString(),
  }),
);

export const mockReferralRecords: ReferralRecord[] = Array.from(
  { length: 11 },
  (_, index) => ({
    id: `ref_${index + 1}`,
    referralCode: `D41M${index + 1}`,
    inviterName: `Inviter ${index + 1}`,
    invitedUserName: `Invited ${index + 1}`,
    rewardStatus: ["invited", "signed_up", "qualified", "rewarded"][
      index % 4
    ] as ReferralRecord["rewardStatus"],
    rewardAmount: index % 2 ? 55 : 50,
    qualifyingTransaction: index % 3 === 0 ? `txn_${index + 1}` : undefined,
    rewardedAt: index % 4 === 3 ? new Date().toISOString() : undefined,
    createdAt: new Date(Date.now() - index * 7200000).toISOString(),
  }),
);

export const mockSupportTickets: SupportTicket[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `TKT-${2000 + index}`,
    userName: `User ${index + 1}`,
    hostName: index % 2 ? `Host ${index + 1}` : undefined,
    subject: ["Payment issue", "Call dropped", "Refund request", "App bug"][
      index % 4
    ],
    priority: ["low", "medium", "high", "critical"][
      index % 4
    ] as SupportTicket["priority"],
    status: ["open", "in_progress", "resolved", "closed"][
      index % 4
    ] as SupportTicket["status"],
    createdAt: new Date(Date.now() - index * 5200000).toISOString(),
  }),
);
