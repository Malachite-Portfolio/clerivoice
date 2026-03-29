import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const appLogo = require('../assets/logo/app-icon.png');

const SIZE_MAP = {
  xs: {
    cardWidth: 84,
    cardHeight: 42,
    imageWidth: 66,
    imageHeight: 26,
    plainWidth: 84,
    plainHeight: 32,
    radius: 12,
  },
  sm: {
    cardWidth: 98,
    cardHeight: 50,
    imageWidth: 78,
    imageHeight: 30,
    plainWidth: 98,
    plainHeight: 38,
    radius: 14,
  },
  md: {
    cardWidth: 122,
    cardHeight: 60,
    imageWidth: 98,
    imageHeight: 38,
    plainWidth: 122,
    plainHeight: 46,
    radius: 16,
  },
  lg: {
    cardWidth: 148,
    cardHeight: 74,
    imageWidth: 120,
    imageHeight: 46,
    plainWidth: 160,
    plainHeight: 60,
    radius: 20,
  },
};

const AppLogo = ({ size = 'sm', withCard = true, style, imageStyle }) => {
  const dimensions = SIZE_MAP[size] || SIZE_MAP.sm;

  if (!withCard) {
    return (
      <Image
        source={appLogo}
        resizeMode="contain"
        style={[
          styles.plainLogo,
          {
            width: dimensions.plainWidth,
            height: dimensions.plainHeight,
          },
          style,
          imageStyle,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          width: dimensions.cardWidth,
          height: dimensions.cardHeight,
          borderRadius: dimensions.radius,
        },
        style,
      ]}
    >
      <Image
        source={appLogo}
        resizeMode="contain"
        style={[
          styles.logoImage,
          {
            width: dimensions.imageWidth,
            height: dimensions.imageHeight,
          },
          imageStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(20, 15, 36, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
  plainLogo: {
    alignSelf: 'center',
  },
});

export default AppLogo;
