import AsyncStorage from "@react-native-async-storage/async-storage";

export const LISTENER_ONBOARDING_COMPLETED_KEY =
  "clarivoice_listener_onboarding_completed_v1";

const isDefaultProfileImage = (profileImageUrl = "") => {
  const normalized = String(profileImageUrl || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized.includes("api.dicebear.com");
};

const hasOnlyDefaultLanguage = (languages = []) => {
  if (!Array.isArray(languages) || languages.length === 0) {
    return true;
  }

  if (languages.length === 1 && String(languages[0] || "").trim().toLowerCase() === "english") {
    return true;
  }

  return false;
};

export const isListenerProfileComplete = (profile = {}) => {
  const listenerProfile = profile?.listenerProfile || {};
  const displayName = String(profile?.displayName || "").trim();
  const defaultDisplayName =
    /^listener-\d{4}$/i.test(displayName) || /^anonymous-\d{4}$/i.test(displayName);
  const bio = String(listenerProfile?.bio || "").trim().toLowerCase();
  const category = String(listenerProfile?.category || "").trim().toLowerCase();
  const experienceYears = Number(listenerProfile?.experienceYears || 0);
  const profileImageUrl = String(profile?.profileImageUrl || "").trim();

  if (!displayName || defaultDisplayName) {
    return false;
  }

  if (!bio || bio === "listener profile") {
    return false;
  }

  if (!category || category === "emotional support") {
    return false;
  }

  if (experienceYears <= 0) {
    return false;
  }

  if (hasOnlyDefaultLanguage(listenerProfile?.languages)) {
    return false;
  }

  if (isDefaultProfileImage(profileImageUrl)) {
    return false;
  }

  return true;
};

export const isListenerOnboardingMarkedComplete = async () => {
  const value = await AsyncStorage.getItem(LISTENER_ONBOARDING_COMPLETED_KEY);
  return String(value || "").trim().toLowerCase() === "true";
};

export const markListenerOnboardingComplete = async () =>
  AsyncStorage.setItem(LISTENER_ONBOARDING_COMPLETED_KEY, "true");

export const clearListenerOnboardingCompleteMark = async () =>
  AsyncStorage.removeItem(LISTENER_ONBOARDING_COMPLETED_KEY);
