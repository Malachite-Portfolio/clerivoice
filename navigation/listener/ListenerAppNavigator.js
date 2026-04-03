import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../../screens/SplashScreen';
import ListenerLoginScreen from '../../screens/ListenerLoginScreen';
import ListenerHomeScreen from '../../screens/ListenerHomeScreen';

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
