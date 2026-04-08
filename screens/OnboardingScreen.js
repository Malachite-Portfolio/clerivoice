import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { getHomeRouteName } from '../navigation/navigationRef';
import { markListenerOnboardingComplete } from '../services/listenerOnboardingStatus';
import {
  DOBScreen,
  DeclarationScreen,
  EducationScreen,
  ExperienceScreen,
  IDUploadScreen,
  IntroScreen,
  JobRoleScreen,
  LanguagesScreen,
  NameSelectionScreen,
  ProfileUploadScreen,
  SubmissionSuccessScreen,
} from './listenerOnboarding';

const DRAFT_KEY = 'clarivoice_listener_onboarding_draft_v1';

const educationOptions = [
  'BTech, BE, MTech, ME, MCA',
  'BCom, BBA, MCom, MBA',
  'BAMS, BDS, Nursing, MBBS, Psychiatry',
  'BA (Psy), MA (Psy), BSc (Psy), MSc (Psy)',
  'Others',
];

const experiencePrimaryOptions = [
  'Loss of a Loved One',
  'Breakup',
  'Divorce',
  'Molestation',
  'Family Conflict',
  'Health Issues',
];

const experienceReasonOptions = ['Cheating', 'Constant fights', 'Dowry', 'Long distance'];

const languageOptions = [
  'Hindi',
  'English',
  'Kannada',
  'Malayalam',
  'Tamil',
  'Telugu',
  'Gujarati',
  'Punjabi',
  'Marathi',
  'Assamese',
  'Bengali',
  'Odia',
];

const idTypes = ['Aadhar card', 'Pan card', 'Voter ID'];

const allNames = [
  'Shreya',
  'Ananya',
  'Meera',
  'Riya',
  'Kavya',
  'Diya',
  'Aashi',
  'Saanvi',
  'Naina',
  'Siya',
  'Aarohi',
  'Samiksha',
  'Ira',
  'Vanya',
  'Tara',
];

const createNamePool = () => {
  const shuffled = [...allNames].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10);
};

const createDefaultState = () => ({
  stepIndex: 0,
  names: createNamePool(),
  selectedName: '',
  dob: '',
  selectedEducation: '',
  experienceType: '',
  experienceReason: '',
  experienceNote: '',
  selectedLanguages: [],
  profileImageUri: '',
  profileUploaded: false,
  idType: idTypes[0],
  idUploaded: false,
});

const OnboardingScreen = ({ navigation }) => {
  const [state, setState] = useState(createDefaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const hydrateDraft = async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw);
        if (!mounted || !parsed || typeof parsed !== 'object') {
          return;
        }

        setState((prev) => ({
          ...prev,
          ...parsed,
          names: Array.isArray(parsed?.names) && parsed.names.length ? parsed.names : prev.names,
        }));
      } catch (_error) {
        // Ignore malformed drafts to keep onboarding resilient.
      } finally {
        if (mounted) {
          setHydrated(true);
        }
      }
    };

    hydrateDraft();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(state)).catch(() => {});
  }, [hydrated, state]);

  const step = state.stepIndex;
  const totalSteps = 10;
  const stepNumber = Math.max(1, Math.min(step, totalSteps));

  const goBack = () => {
    if (step === 0) {
      navigation.goBack();
      return;
    }

    setState((prev) => ({ ...prev, stepIndex: Math.max(prev.stepIndex - 1, 0) }));
  };

  const goNext = () => {
    setState((prev) => ({ ...prev, stepIndex: Math.min(prev.stepIndex + 1, 10) }));
  };

  const regenerateNames = () => {
    setState((prev) => ({
      ...prev,
      names: createNamePool(),
      selectedName: '',
    }));
  };

  const toggleLanguage = (language) => {
    setState((prev) => {
      const exists = prev.selectedLanguages.includes(language);
      const nextLanguages = exists
        ? prev.selectedLanguages.filter((item) => item !== language)
        : [...prev.selectedLanguages, language];
      return { ...prev, selectedLanguages: nextLanguages };
    });
  };

  const cycleIdType = () => {
    setState((prev) => {
      const currentIndex = idTypes.indexOf(prev.idType);
      const nextIndex = (currentIndex + 1) % idTypes.length;
      return { ...prev, idType: idTypes[nextIndex] };
    });
  };

  const pickImage = async (mode = 'profile') => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow gallery access to continue.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result?.canceled) {
        return;
      }

      const uri = result?.assets?.[0]?.uri || '';
      if (!uri) {
        return;
      }

      if (mode === 'profile') {
        setState((prev) => ({ ...prev, profileImageUri: uri, profileUploaded: true }));
      } else {
        setState((prev) => ({ ...prev, idUploaded: true }));
      }
    } catch (_error) {
      Alert.alert('Upload failed', 'Unable to pick image right now.');
    }
  };

  const finish = async () => {
    await AsyncStorage.removeItem(DRAFT_KEY);
    await markListenerOnboardingComplete();
    navigation.reset({
      index: 0,
      routes: [{ name: getHomeRouteName() }],
    });
  };

  const screen = useMemo(() => {
    if (step === 0) {
      return <IntroScreen onNext={goNext} />;
    }

    if (step === 1) {
      return (
        <JobRoleScreen
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 2) {
      return (
        <NameSelectionScreen
          options={state.names}
          selectedName={state.selectedName}
          onSelect={(name) => setState((prev) => ({ ...prev, selectedName: name }))}
          onRegenerate={regenerateNames}
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 3) {
      return (
        <DOBScreen
          value={state.dob}
          onChange={(dob) => setState((prev) => ({ ...prev, dob }))}
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 4) {
      return (
        <DeclarationScreen
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 5) {
      return (
        <EducationScreen
          options={educationOptions}
          selectedEducation={state.selectedEducation}
          onSelect={(selectedEducation) => setState((prev) => ({ ...prev, selectedEducation }))}
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 6) {
      return (
        <ExperienceScreen
          primaryOptions={experiencePrimaryOptions}
          reasonOptions={experienceReasonOptions}
          experienceType={state.experienceType}
          experienceReason={state.experienceReason}
          experienceNote={state.experienceNote}
          onSelectType={(experienceType) => setState((prev) => ({ ...prev, experienceType }))}
          onSelectReason={(experienceReason) =>
            setState((prev) => ({ ...prev, experienceReason }))
          }
          onChangeNote={(experienceNote) =>
            setState((prev) => ({ ...prev, experienceNote: experienceNote.slice(0, 120) }))
          }
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 7) {
      return (
        <LanguagesScreen
          options={languageOptions}
          selectedLanguages={state.selectedLanguages}
          onToggle={toggleLanguage}
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 8) {
      return (
        <ProfileUploadScreen
          profileImageUri={state.profileImageUri}
          uploaded={state.profileUploaded}
          onUploadPress={() => pickImage('profile')}
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    if (step === 9) {
      return (
        <IDUploadScreen
          idType={state.idType}
          onCycleIdType={cycleIdType}
          uploaded={state.idUploaded}
          onUploadPress={() => pickImage('id')}
          onBack={goBack}
          onNext={goNext}
          step={stepNumber}
          totalSteps={totalSteps}
        />
      );
    }

    return (
      <SubmissionSuccessScreen
        onBack={goBack}
        onDone={finish}
        step={stepNumber}
        totalSteps={totalSteps}
      />
    );
  }, [
    step,
    stepNumber,
    state.dob,
    state.experienceNote,
    state.experienceReason,
    state.experienceType,
    state.idType,
    state.idUploaded,
    state.names,
    state.profileImageUri,
    state.profileUploaded,
    state.selectedEducation,
    state.selectedLanguages,
    state.selectedName,
  ]);

  return screen;
};

export default OnboardingScreen;
