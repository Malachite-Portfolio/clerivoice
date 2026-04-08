const { env } = require('../../config/env');
const { MockPaymentProvider } = require('./providers/mock.provider');
const { RazorpayProvider } = require('./providers/razorpay.provider');
const { StripeProvider } = require('./providers/stripe.provider');

const getPaymentProvider = () => {
  if (env.PAYMENT_PROVIDER === 'razorpay') {
    return new RazorpayProvider({
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
    });
  }

  if (env.PAYMENT_PROVIDER === 'stripe') {
    return new StripeProvider({
      secretKey: env.STRIPE_SECRET_KEY,
    });
  }

  return new MockPaymentProvider();
};

module.exports = { getPaymentProvider };
