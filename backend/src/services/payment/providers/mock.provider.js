const { randomUUID } = require('crypto');
const { BasePaymentProvider } = require('./base.provider');

class MockPaymentProvider extends BasePaymentProvider {
  constructor() {
    super('mock');
  }

  async createOrder(payload) {
    return {
      gatewayOrderId: `mock_order_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      metadata: {
        simulated: true,
        amount: payload.payableAmount,
      },
    };
  }

  async verifyPayment({ gatewayPaymentId }) {
    if (!gatewayPaymentId) {
      return {
        isVerified: false,
        reason: 'Missing gatewayPaymentId',
      };
    }

    if (String(gatewayPaymentId).toLowerCase().startsWith('fail')) {
      return {
        isVerified: false,
        reason: 'Mock verification failed',
      };
    }

    return {
      isVerified: true,
      providerReference: gatewayPaymentId,
    };
  }
}

module.exports = { MockPaymentProvider };
