import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import theme from '../../theme';

const ProfileAvatar = ({
  source,
  size = 52,
  showOnline = false,
  online = false,
  ringColor,
  style,
}) => (
  <View
    style={[
      styles.wrap,
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        borderColor: ringColor || theme.colors.primary,
      },
      style,
    ]}
  >
    <Image source={source} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} />
    {showOnline ? (
      <View
        style={[
          styles.dot,
          {
            backgroundColor: online ? theme.colors.onlineDot : theme.colors.offlineDot,
            borderColor: theme.colors.background,
          },
        ]}
      />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1.5,
    padding: 2,
    overflow: 'visible',
  },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});

export default ProfileAvatar;
