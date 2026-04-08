import React from 'react';
import { OnboardingLayout, SelectionGridLayout } from '../../components/layouts';

const LanguagesScreen = ({
  options,
  selectedLanguages,
  onToggle,
  onBack,
  onNext,
  step,
  totalSteps,
}) => (
  <OnboardingLayout
    title="Languages"
    titleAccent="Known"
    currentStep={step}
    totalSteps={totalSteps}
    showBack
    onBack={onBack}
    ctaLabel="Next"
    onCtaPress={onNext}
    ctaDisabled={!selectedLanguages.length}
  >
    <SelectionGridLayout
      options={options.map((item) => ({ title: item, value: item }))}
      selectedValues={selectedLanguages}
      onSelect={onToggle}
      columns={2}
    />
  </OnboardingLayout>
);

export default LanguagesScreen;
