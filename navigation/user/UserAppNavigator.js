import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../../screens/SplashScreen';
import PhoneNumberScreen from '../../screens/PhoneNumberScreen';
import OtpScreen from '../../screens/OtpScreen';
import DrawerNavigator from '../DrawerNavigator';
import CallSessionScreen from '../../screens/CallSessionScreen';
import ChatSessionScreen from '../../screens/ChatSessionScreen';
import MyWalletScreen from '../../screens/MyWalletScreen';
import OffersScreen from '../../screens/OffersScreen';
import InviteFriendsScreen from '../../screens/InviteFriendsScreen';

const Stack = createNativeStackNavigator();

const UserAppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="PhoneNumber" component={PhoneNumberScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="MainDrawer" component={DrawerNavigator} />
      <Stack.Screen name="CallSession" component={CallSessionScreen} />
      <Stack.Screen name="ChatSession" component={ChatSessionScreen} />
      <Stack.Screen name="MyWallet" component={MyWalletScreen} />
      <Stack.Screen name="Offers" component={OffersScreen} />
      <Stack.Screen name="InviteFriends" component={InviteFriendsScreen} />
    </Stack.Navigator>
  );
};

export default UserAppNavigator;
