import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import theme from '../constants/theme';

const SHEET_START = 320;

const BottomSheetAnonymous = ({ visible, onClose }) => {
  const translateY = useRef(new Animated.Value(SHEET_START)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(SHEET_START);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [translateY, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.wrapper}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
          <LinearGradient
            colors={['#1B0821', '#260B2D', '#1A0820']}
            style={styles.sheet}
          >
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="close" size={22} color={theme.colors.magenta} />
            </TouchableOpacity>

            <MaterialCommunityIcons
              name="incognito-circle"
              size={36}
              color={theme.colors.magenta}
              style={styles.mainIcon}
            />
            <Text style={styles.title}>You are Anonymous</Text>
            <Text style={styles.subtitle}>
              Dear User, Your profile is anonymous to everyone
            </Text>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    minHeight: 208,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 34,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 23, 155, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainIcon: {
    marginTop: 14,
    marginBottom: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: theme.typography.h3,
    marginBottom: 6,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontSize: theme.typography.body,
    lineHeight: 22,
    maxWidth: 290,
  },
});

export default BottomSheetAnonymous;
