import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../../screens/SplashScreen';
import ListenerLoginScreen from '../../screens/ListenerLoginScreen';
import ListenerHomeScreen from '../../screens/ListenerHomeScreen';
import CallSessionScreen from '../../screens/CallSessionScreen';
import ChatSessionScreen from '../../screens/ChatSessionScreen';

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
      <Stack.Screen name="ListenerLogin" component={ListenerLoginScreen} />
      <Stack.Screen name="ListenerHome" component={ListenerHomeScreen} />
      <Stack.Screen name="CallSession" component={CallSessionScreen} />
      <Stack.Screen name="ChatSession" component={ChatSessionScreen} />
    </Stack.Navigator>
  );
};

export default ListenerAppNavigator;
