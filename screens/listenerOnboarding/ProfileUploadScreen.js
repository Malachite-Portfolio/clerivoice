import React from 'react';
import { UploadLayout, OnboardingLayout } from '../../components/layouts';

const ProfileUploadScreen = ({
  profileImageUri,
  uploaded,
  onUploadPress,
  onBack,
  onNext,
  step,
  totalSteps,
}) => (
  <OnboardingLayout
    title="Upload"
    titleAccent="Profile picture"
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel={uploaded ? 'Next' : 'Upload image'}
    onCtaPress={uploaded ? onNext : onUploadPress}
  >
    <UploadLayout
      imageUri={profileImageUri}
      title="Sample image"
      helperLeft="Front Face"
      helperRight="Smiling"
      status={uploaded ? 'success' : 'idle'}
      onUploadPress={onUploadPress}
      successMessage={uploaded ? 'Uploaded successfully' : ''}
    />
  </OnboardingLayout>
);

export default ProfileUploadScreen;
