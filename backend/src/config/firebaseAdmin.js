const admin = require('firebase-admin');
const { env } = require('./env');
const { logger } = require('./logger');

const getMissingFirebaseAdminKeys = () => {
  const missing = [];

  if (!env.FIREBASE_PROJECT_ID) {
    missing.push('FIREBASE_PROJECT_ID');
  }
  if (!env.FIREBASE_CLIENT_EMAIL) {
    missing.push('FIREBASE_CLIENT_EMAIL');
  }
  if (!env.FIREBASE_PRIVATE_KEY) {
    missing.push('FIREBASE_PRIVATE_KEY');
  }

  return missing;
};

const initializeFirebaseAdmin = () => {
  if (admin.apps.length) {
    return admin.app();
  }

  const missingKeys = getMissingFirebaseAdminKeys();
  if (missingKeys.length) {
    const message = `Firebase Admin is not configured. Missing env vars: ${missingKeys.join(
      ', '
    )}`;
    logger.error('[FirebaseAdmin] initialization blocked', { missingKeys });
    throw new Error(message);
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
    });

    logger.info('[FirebaseAdmin] initialized successfully');
    return admin.app();
  } catch (error) {
    logger.error('[FirebaseAdmin] initialization failed', {
      message: error?.message,
    });
    throw new Error(`Firebase Admin initialization failed: ${error?.message}`);
  }
};

const getFirebaseAuth = () => initializeFirebaseAdmin().auth();

module.exports = {
  admin,
  initializeFirebaseAdmin,
  getFirebaseAuth,
};
