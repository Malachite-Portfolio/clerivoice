import auth from "@react-native-firebase/auth";

const ensureVerificationId = (verificationId) => {
  const normalizedVerificationId = String(verificationId || "").trim();
  if (!normalizedVerificationId) {
    const missingVerificationError = new Error(
      "Firebase did not return verification ID.",
    );
    missingVerificationError.code = "auth/missing-verification-id";
    throw missingVerificationError;
  }
  return normalizedVerificationId;
};

export const sendFirebaseOtp = async (phone) => {
  const confirmation = await auth().signInWithPhoneNumber(phone);
  const verificationId = ensureVerificationId(confirmation?.verificationId);

  return {
    verificationId,
    confirmation,
  };
};

const verifyUsingConfirmationObject = async ({ confirmation, code }) => {
  if (!confirmation || typeof confirmation?.confirm !== "function") {
    return null;
  }

  const normalizedCode = String(code || "").trim();
  const authResult = await confirmation.confirm(normalizedCode);
  return authResult || null;
};

export const verifyFirebaseOtpCode = async ({ verificationId, code, confirmation }) => {
  const normalizedCode = String(code || "").trim();
  let authResult = null;

  if (confirmation) {
    authResult = await verifyUsingConfirmationObject({ confirmation, code: normalizedCode });
  }

  if (!authResult) {
    const normalizedVerificationId = ensureVerificationId(verificationId);
    const credential = auth.PhoneAuthProvider.credential(
      normalizedVerificationId,
      normalizedCode,
    );
    authResult = await auth().signInWithCredential(credential);
  }

  const firebaseUid = String(authResult?.user?.uid || "").trim();

  if (!firebaseUid) {
    const missingUidError = new Error("Firebase user UID not available after OTP verification.");
    missingUidError.code = "auth/missing-uid";
    throw missingUidError;
  }

  return {
    firebaseUid,
    firebaseUser: authResult?.user || null,
  };
};
