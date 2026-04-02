const extractDigits = (value = '') => String(value || '').replace(/\D/g, '');

const toLocalIndianDigits = (value = '') => {
  const digits = extractDigits(value);

  if (!digits) {
    return '';
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  return digits.slice(-10);
};

export const normalizeIndianPhoneInput = (value = '') => toLocalIndianDigits(value).slice(0, 10);

export const toIndianE164 = (value = '') => {
  const localDigits = toLocalIndianDigits(value).slice(0, 10);

  if (!localDigits) {
    return '';
  }

  return `+91${localDigits}`;
};
