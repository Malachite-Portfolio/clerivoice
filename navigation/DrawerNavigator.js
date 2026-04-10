import React from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
} from '@react-navigation/drawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatCallHubScreen from '../screens/ChatCallHubScreen';
import { drawerMenuItems } from '../constants/mockData';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { getAuthEntryRouteName } from './navigationRef';
import AppLogo from '../components/AppLogo';
import { resolveAvatarSource } from '../services/avatarResolver';

const Drawer = createDrawerNavigator();
const sectionBreaks = {
  refer: 'Only for you',
  care: 'Communicate',
};

const CustomDrawerContent = ({ navigation }) => {
  const { session, logout } = useAuth();
  const avatarSource = resolveAvatarSource({
    uploadedImageUrl: session?.user?.uploadedProfileImageUrl || null,
    profileImageUrl: session?.user?.profileImageUrl || null,
    id: session?.user?.id || null,
    phone: session?.user?.phone || null,
    name: session?.user?.displayName || null,
    role: session?.user?.role || null,
  });

  const navigateToRoute = (routeName) => {
    const parentNavigation = navigation.getParent();
    const usesParentRoute = ['MyWallet', 'Offers', 'InviteFriends'].includes(routeName);

    console.log('[Wallet] route navigation', {
      from: 'Drawer',
      to: routeName,
    });

    if (usesParentRoute && parentNavigation) {
      parentNavigation.navigate(routeName);
      navigation.closeDrawer();
      return;
    }

    navigation.navigate(routeName);
    navigation.closeDrawer();
  };

  const onMenuPress = async (item) => {
    if (item.route) {
      navigateToRoute(item.route);
      return;
    }

    if (item.id === 'logout') {
      navigation.closeDrawer();
      await logout();
      navigation.reset({
        index: 0,
        routes: [{ name: getAuthEntryRouteName() }],
      });
      return;
    }

    navigation.closeDrawer();
    Alert.alert(item.title, 'This feature will be available soon.');
  };

  return (
    <LinearGradient colors={theme.gradients.drawer} style={styles.drawerContainer}>
      <SafeAreaView style={styles.drawerSafeArea} edges={['top', 'left', 'right']}>
        <DrawerContentScrollView
          contentContainerStyle={styles.drawerScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.userBox}>
            <AppLogo size="sm" style={styles.drawerLogo} />
            {/* Replace with dedicated avatar placeholder in assets/main if available */}
            <Image source={avatarSource} style={styles.userAvatar} />
            <Text style={styles.userName}>
              {session?.user?.displayName || 'Anonymous'}
            </Text>
            <Text style={styles.userPhone}>
              {session?.user?.phone || "Phone not available"}
            </Text>
          </View>

          {drawerMenuItems.map((item, index) => {
            return (
              <View key={item.id}>
                {sectionBreaks[item.id] ? (
                  <Text style={styles.sectionLabel}>{sectionBreaks[item.id]}</Text>
                ) : null}

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => onMenuPress(item)}
                  activeOpacity={0.86}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={theme.colors.magenta}
                    style={styles.menuIcon}
                  />
                  <Text style={styles.menuText}>{item.title}</Text>
                </TouchableOpacity>

                {index < drawerMenuItems.length - 1 ? (
                  <View style={styles.separator} />
                ) : null}
              </View>
            );
          })}

          <View style={styles.footerWrap}>
            <Text style={styles.footerText}>App v2.0</Text>
          </View>
        </DrawerContentScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const DrawerNavigator = () => {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'slide',
        drawerStyle: {
          width: 290,
          backgroundColor: 'transparent',
        },
        overlayColor: 'rgba(0,0,0,0.55)',
        sceneContainerStyle: {
          backgroundColor: 'transparent',
        },
        swipeEdgeWidth: 85,
      }}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
      <Drawer.Screen name="ChatCallHub" component={ChatCallHubScreen} />
    </Drawer.Navigator>
  );
};

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(207, 36, 155, 0.3)',
  },
  drawerSafeArea: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingTop: 12,
    paddingBottom: 20,
    minHeight: '100%',
  },
  userBox: {
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  drawerLogo: {
    marginBottom: 12,
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: theme.colors.magenta,
    marginBottom: 9,
  },
  userName: {
    color: theme.colors.textPrimary,
    fontSize: 25 / 1.4,
    fontWeight: '700',
  },
  userPhone: {
    color: theme.colors.textSecondary,
    fontSize: 18 / 1.4,
    marginTop: 2,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 23 / 1.6,
    paddingHorizontal: 18,
    marginTop: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuText: {
    color: theme.colors.textPrimary,
    fontSize: 26 / 1.7,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    marginHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  footerWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    marginTop: 36,
    paddingHorizontal: 18,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'left',
    opacity: 0.86,
  },
});

export default DrawerNavigator;
