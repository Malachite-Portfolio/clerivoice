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
import {
  getPresenceDotColor,
  normalizePresenceStatus,
  PRESENCE_STATUS,
} from '../services/presenceStatus';

const StoryAvatar = ({
  name,
  image,
  online = false,
  presenceStatus = null,
  onPress,
  avatarSeedId = null,
}) => {
  const initials = name.slice(0, 1).toUpperCase();
  const imageSource = resolveAvatarSource({
    avatarUrl: image,
    id: avatarSeedId || name,
    name,
    role: 'LISTENER',
  });
  const status = normalizePresenceStatus(
    presenceStatus || (online ? PRESENCE_STATUS.ONLINE : PRESENCE_STATUS.OFFLINE),
  );

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
        <View style={[styles.onlineDot, { backgroundColor: getPresenceDotColor(status) }]} />
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
    width: 70,
  },
  outerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.8,
    borderColor: theme.colors.magenta,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 18, 35, 0.8)',
  },
  innerCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C6C9A0',
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
    right: 1,
    bottom: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: '#130A20',
  },
  name: {
    marginTop: 5,
    color: theme.colors.textMuted,
    fontSize: 11,
    maxWidth: 72,
  },
});

export default StoryAvatar;
