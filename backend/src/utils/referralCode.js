const { randomUUID } = require('crypto');

const buildReferralCode = (name = 'USER') => {
  const cleanPrefix = name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'CLAR';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase();
  return `${cleanPrefix}${suffix}`;
};

module.exports = { buildReferralCode };
