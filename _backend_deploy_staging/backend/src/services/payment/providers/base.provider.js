class BasePaymentProvider {
  constructor(name) {
    this.name = name;
  }

  async createOrder(_payload) {
    throw new Error(`createOrder not implemented for ${this.name}`);
  }

  async verifyPayment(_payload) {
    throw new Error(`verifyPayment not implemented for ${this.name}`);
  }
}

module.exports = { BasePaymentProvider };
