import React from 'react';
import { OnboardingLayout, SuccessLayout } from '../../components/layouts';

const SubmissionSuccessScreen = ({ onBack, onDone, step, totalSteps }) => (
  <OnboardingLayout
    title="Application"
    titleAccent="Submitted Successfully"
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel="Done"
    onCtaPress={onDone}
  >
    <SuccessLayout
      title=""
      note="Your profile and document verification usually takes up to 2 business days."
      footerText="Uploaded successfully"
    />
  </OnboardingLayout>
);

export default SubmissionSuccessScreen;
