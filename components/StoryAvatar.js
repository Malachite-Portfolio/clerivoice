import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import theme from '../constants/theme';
import { resolveAvatarSource } from '../services/avatarResolver';

const StoryAvatar = ({ name, image, online = false, onPress, avatarSeedId = null }) => {
  const initials = name.slice(0, 1).toUpperCase();
  const imageSource = resolveAvatarSource({
    avatarUrl: image,
    id: avatarSeedId || name,
    name,
    role: 'LISTENER',
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.container}
      onPress={onPress}
    >
      <View style={styles.outerRing}>
        <View style={styles.innerCircle}>
          {imageSource ? (
            <Image source={imageSource} style={styles.image} />
          ) : (
            <Text style={styles.initials}>{initials}</Text>
          )}
        </View>
        {online ? <View style={styles.onlineDot} /> : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    width: 72,
  },
  outerRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.6,
    borderColor: theme.colors.magenta,
    borderStyle: 'dotted',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(42, 20, 48, 0.36)',
  },
  innerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#D8D8D8',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  initials: {
    color: '#3C3851',
    fontWeight: '700',
    fontSize: 18,
  },
  onlineDot: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.bgPrimary,
  },
  name: {
    marginTop: 5,
    color: theme.colors.textSecondary,
    fontSize: 12,
    maxWidth: 72,
  },
});

export default StoryAvatar;
