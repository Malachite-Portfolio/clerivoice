const { BasePaymentProvider } = require('./base.provider');
const { AppError } = require('../../../utils/appError');

class NoopPaymentProvider extends BasePaymentProvider {
  constructor({ configuredProvider } = {}) {
    super(configuredProvider || 'razorpay');
    this.isNoop = true;
  }

  throwNotConfigured() {
    throw new AppError(
      'Payment provider not configured',
      503,
      'PAYMENT_PROVIDER_NOT_CONFIGURED'
    );
  }

  async createOrder(_payload) {
    this.throwNotConfigured();
  }

  async verifyPayment(_payload) {
    this.throwNotConfigured();
  }

  async initiatePayment(_payload) {
    this.throwNotConfigured();
  }
}

module.exports = { NoopPaymentProvider };
