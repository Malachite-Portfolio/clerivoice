const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
const { MockPaymentProvider } = require('./providers/mock.provider');
const { NoopPaymentProvider } = require('./providers/noop.provider');
const { RazorpayProvider } = require('./providers/razorpay.provider');
const { StripeProvider } = require('./providers/stripe.provider');

let hasLoggedDisabledMode = false;

const hasValue = (value) => String(value || '').trim().length > 0;
const hasRazorpayConfig = () => hasValue(env.RAZORPAY_KEY_ID) && hasValue(env.RAZORPAY_KEY_SECRET);
const hasStripeConfig = () => hasValue(env.STRIPE_SECRET_KEY);

const logDisabledModeOnce = ({ provider, reason }) => {
  if (hasLoggedDisabledMode) {
    return;
  }

  logger.warn('Payment provider not configured. Running in payout-disabled mode.', {
    provider: provider || 'none',
    reason,
  });
  logger.warn('\u26A0\uFE0F Payment provider disabled \u2014 manual payout mode active');
  hasLoggedDisabledMode = true;
};

const getNoopProvider = ({ provider, reason }) => {
  if (env.NODE_ENV === 'production') {
    logDisabledModeOnce({ provider, reason });
  }

  return new NoopPaymentProvider({
    configuredProvider: provider || 'razorpay',
  });
};

const getPaymentProvider = () => {
  const provider = String(env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  const isProduction = env.NODE_ENV === 'production';

  if (provider === 'mock') {
    if (isProduction) {
      throw new Error('PAYMENT_PROVIDER=mock is not allowed in production.');
    }
    return new MockPaymentProvider();
  }

  if (provider === 'razorpay') {
    if (!hasRazorpayConfig()) {
      if (isProduction) {
        return getNoopProvider({
          provider: 'razorpay',
          reason: 'RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing',
        });
      }

      throw new Error('Razorpay configuration is missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }

    return new RazorpayProvider({
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
    });
  }

  if (provider === 'stripe') {
    if (!hasStripeConfig()) {
      if (isProduction) {
        return getNoopProvider({
          provider: 'stripe',
          reason: 'STRIPE_SECRET_KEY missing',
        });
      }

      throw new Error('Stripe configuration is missing. Set STRIPE_SECRET_KEY.');
    }

    return new StripeProvider({
      secretKey: env.STRIPE_SECRET_KEY,
    });
  }

  if (!provider) {
    if (isProduction) {
      return getNoopProvider({
        provider: '',
        reason: 'PAYMENT_PROVIDER not configured',
      });
    }

    return new MockPaymentProvider();
  }

  if (isProduction) {
    return getNoopProvider({
      provider,
      reason: `Unsupported PAYMENT_PROVIDER "${provider}"`,
    });
  }

  return new MockPaymentProvider();
};

module.exports = { getPaymentProvider };

