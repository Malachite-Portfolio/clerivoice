import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import PhoneNumberScreen from '../screens/PhoneNumberScreen';
import OtpScreen from '../screens/OtpScreen';
import DrawerNavigator from './DrawerNavigator';
import CallSessionScreen from '../screens/CallSessionScreen';
import ChatSessionScreen from '../screens/ChatSessionScreen';
import ListenerLoginScreen from '../screens/ListenerLoginScreen';
import ListenerHomeScreen from '../screens/ListenerHomeScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="PhoneNumber" component={PhoneNumberScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="ListenerLogin" component={ListenerLoginScreen} />
      <Stack.Screen name="ListenerHome" component={ListenerHomeScreen} />
      <Stack.Screen name="MainDrawer" component={DrawerNavigator} />
      <Stack.Screen name="CallSession" component={CallSessionScreen} />
      <Stack.Screen name="ChatSession" component={ChatSessionScreen} />
    </Stack.Navigator>
  );
};

export default AppNavigator;
