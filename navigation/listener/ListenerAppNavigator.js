import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../../screens/SplashScreen';
import ListenerLoginScreen from '../../screens/ListenerLoginScreen';
import ListenerHomeScreen from '../../screens/ListenerHomeScreen';
import ProfileScreen from '../../screens/ProfileScreen';
import ListenerWalletScreen from '../../screens/ListenerWalletScreen';
import OnboardingScreen from '../../screens/OnboardingScreen';
import ListenerIntroCarouselScreen from '../../screens/ListenerIntroCarouselScreen';
import PhoneNumberScreen from '../../screens/PhoneNumberScreen';
import OtpScreen from '../../screens/OtpScreen';

const Stack = createNativeStackNavigator();

const ListenerAppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="ListenerIntroCarousel" component={ListenerIntroCarouselScreen} />
      <Stack.Screen name="PhoneNumber" component={PhoneNumberScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="ListenerLogin" component={ListenerLoginScreen} />
      <Stack.Screen name="ListenerOnboarding" component={OnboardingScreen} />
      <Stack.Screen name="ListenerHome" component={ListenerHomeScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="ListenerWallet" component={ListenerWalletScreen} />
      <Stack.Screen
        name="CallSession"
        getComponent={() => require('../../screens/CallSessionScreen').default}
      />
      <Stack.Screen
        name="ChatSession"
        getComponent={() => require('../../screens/ChatSessionScreen').default}
      />
    </Stack.Navigator>
  );
};

export default ListenerAppNavigator;
