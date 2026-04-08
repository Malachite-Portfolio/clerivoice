const { BasePaymentProvider } = require('./base.provider');

class StripeProvider extends BasePaymentProvider {
  constructor({ secretKey }) {
    super('stripe');
    this.secretKey = secretKey;
  }

  async createOrder(payload) {
    if (!this.secretKey) {
      throw new Error('Stripe secret key is not configured');
    }

    return {
      gatewayOrderId: `stripe_intent_placeholder_${Date.now()}`,
      metadata: {
        provider: 'stripe',
        note: 'Replace placeholder integration with Stripe PaymentIntent.',
        amount: payload.payableAmount,
      },
    };
  }

  async verifyPayment(payload) {
    if (!this.secretKey) {
      return {
        isVerified: false,
        reason: 'Stripe secret key is not configured',
      };
    }

    return {
      isVerified: !!payload.gatewayPaymentId,
      providerReference: payload.gatewayPaymentId,
    };
  }
}

module.exports = { StripeProvider };
