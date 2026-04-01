import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';

const WalletFlowContext = createContext(null);

const normalizePlan = (plan) => {
  if (!plan) {
    return null;
  }

  const amount = Number(plan.amount || 0);
  const talktime = Number(plan.talktime || amount);
  const planId = Number.isFinite(Number(plan.planId || plan.id)) ? Number(plan.planId || plan.id) : null;

  return {
    ...plan,
    id: plan.id ?? `amount-${amount}`,
    planId,
    amount,
    talktime,
    label: plan.label || `INR ${amount}`,
  };
};

const normalizeCoupon = (coupon) => {
  if (!coupon) {
    return null;
  }

  return {
    code: String(coupon.code || '').trim().toUpperCase(),
    description: coupon.description || '',
    discountAmount: Number(coupon.discountAmount || 0),
    payableAmount: Number(coupon.payableAmount || coupon.amount || 0),
    amount: Number(coupon.amount || 0),
  };
};

export const WalletFlowProvider = ({ children }) => {
  const { session } = useAuth();
  const previousUserIdRef = useRef(session?.user?.id || null);
  const [selectedPlan, setSelectedPlanState] = useState(null);
  const [selectedCoupon, setSelectedCouponState] = useState(null);
  const [currentBalance, setCurrentBalanceState] = useState(0);
  const [referralCode, setReferralCodeState] = useState('');

  useEffect(() => {
    const currentUserId = session?.user?.id || null;
    if (previousUserIdRef.current === currentUserId) {
      return;
    }

    previousUserIdRef.current = currentUserId;
    setSelectedPlanState(null);
    setSelectedCouponState(null);
    setCurrentBalanceState(0);
    setReferralCodeState('');
  }, [session?.user?.id]);

  const setSelectedPlan = useCallback((plan) => {
    const normalized = normalizePlan(plan);
    console.log('[Wallet] selected recharge amount', {
      amount: normalized?.amount || 0,
      talktime: normalized?.talktime || 0,
      planId: normalized?.planId || null,
    });
    setSelectedPlanState(normalized);
  }, []);

  const applyCouponSelection = useCallback((coupon) => {
    const normalized = normalizeCoupon(coupon);
    console.log('[Wallet] coupon apply result', {
      code: normalized?.code || null,
      discountAmount: normalized?.discountAmount || 0,
      payableAmount: normalized?.payableAmount || 0,
    });
    setSelectedCouponState(normalized);
  }, []);

  const clearCouponSelection = useCallback(() => {
    setSelectedCouponState(null);
  }, []);

  const setCurrentBalance = useCallback((amount) => {
    setCurrentBalanceState(Number(amount || 0));
  }, []);

  const setReferralCode = useCallback((nextCode) => {
    setReferralCodeState(String(nextCode || '').trim().toUpperCase());
  }, []);

  const value = useMemo(
    () => ({
      selectedPlan,
      selectedCoupon,
      currentBalance,
      referralCode,
      setSelectedPlan,
      applyCouponSelection,
      clearCouponSelection,
      setCurrentBalance,
      setReferralCode,
    }),
    [
      applyCouponSelection,
      clearCouponSelection,
      currentBalance,
      referralCode,
      selectedCoupon,
      selectedPlan,
      setCurrentBalance,
      setReferralCode,
      setSelectedPlan,
    ],
  );

  return <WalletFlowContext.Provider value={value}>{children}</WalletFlowContext.Provider>;
};

export const useWalletFlow = () => {
  const context = useContext(WalletFlowContext);
  if (!context) {
    throw new Error('useWalletFlow must be used within WalletFlowProvider');
  }

  return context;
};
