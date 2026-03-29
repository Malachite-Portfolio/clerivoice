import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import theme from '../constants/theme';

const StoryAvatar = ({ name, image, online = false, onPress }) => {
  const initials = name.slice(0, 1).toUpperCase();
  const imageSource =
    typeof image === 'string' ? { uri: image } : image || null;

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
    width: 62,
  },
  outerRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.6,
    borderColor: theme.colors.magenta,
    borderStyle: 'dotted',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(42, 20, 48, 0.36)',
  },
  innerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
    right: 2,
    bottom: 4,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.bgPrimary,
  },
  name: {
    marginTop: 5,
    color: theme.colors.textSecondary,
    fontSize: 12,
    maxWidth: 62,
  },
});

export default StoryAvatar;
