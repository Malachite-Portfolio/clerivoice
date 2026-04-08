const { BasePaymentProvider } = require('./base.provider');

class RazorpayProvider extends BasePaymentProvider {
  constructor({ keyId, keySecret }) {
    super('razorpay');
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  async createOrder(payload) {
    if (!this.keyId || !this.keySecret) {
      throw new Error('Razorpay keys are not configured');
    }

    return {
      gatewayOrderId: `razorpay_order_placeholder_${Date.now()}`,
      metadata: {
        provider: 'razorpay',
        note: 'Replace placeholder integration with Razorpay SDK call.',
        amount: payload.payableAmount,
      },
    };
  }

  async verifyPayment(payload) {
    if (!this.keyId || !this.keySecret) {
      return {
        isVerified: false,
        reason: 'Razorpay keys are not configured',
      };
    }

    return {
      isVerified: !!payload.gatewayPaymentId,
      providerReference: payload.gatewayPaymentId,
    };
  }
}

module.exports = { RazorpayProvider };
