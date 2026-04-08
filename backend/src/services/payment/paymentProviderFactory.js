const { env } = require('../../config/env');
const { MockPaymentProvider } = require('./providers/mock.provider');
const { RazorpayProvider } = require('./providers/razorpay.provider');
const { StripeProvider } = require('./providers/stripe.provider');

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
    if (!String(env.RAZORPAY_KEY_ID || '').trim() || !String(env.RAZORPAY_KEY_SECRET || '').trim()) {
      throw new Error('Razorpay configuration is missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }

    return new RazorpayProvider({
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
    });
  }

  if (provider === 'stripe') {
    if (!String(env.STRIPE_SECRET_KEY || '').trim()) {
      throw new Error('Stripe configuration is missing. Set STRIPE_SECRET_KEY.');
    }

    return new StripeProvider({
      secretKey: env.STRIPE_SECRET_KEY,
    });
  }

  if (isProduction) {
    throw new Error(`Unsupported PAYMENT_PROVIDER "${provider}" in production.`);
  }

  return new MockPaymentProvider();
};

module.exports = { getPaymentProvider };
