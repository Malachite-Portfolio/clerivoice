import React from 'react';
import { OnboardingLayout, SelectionGridLayout } from '../../components/layouts';

const EducationScreen = ({
  options,
  selectedEducation,
  onSelect,
  onBack,
  onNext,
  step,
  totalSteps,
}) => (
  <OnboardingLayout
    title="Your"
    titleAccent="Education"
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel="Next"
    onCtaPress={onNext}
    ctaDisabled={!selectedEducation}
  >
    <SelectionGridLayout
      options={options.map((item) => ({ title: item, value: item }))}
      selectedValues={selectedEducation ? [selectedEducation] : []}
      onSelect={onSelect}
      columns={1}
    />
  </OnboardingLayout>
);

export default EducationScreen;
