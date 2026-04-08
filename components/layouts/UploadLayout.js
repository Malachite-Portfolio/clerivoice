import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UploadCard } from '../ui';
import theme from '../../theme';

const UploadLayout = ({
  imageUri,
  title,
  helperLeft,
  helperRight,
  status,
  onUploadPress,
  successMessage,
  subtitle,
}) => (
  <View>
    <UploadCard
      imageUri={imageUri}
      title={title}
      helperLeft={helperLeft}
      helperRight={helperRight}
      status={status}
      subtitle={subtitle}
      onPress={onUploadPress}
    />

    {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  success: {
    marginTop: theme.spacing.lg,
    textAlign: 'center',
    color: theme.colors.success,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.semibold,
  },
});

export default UploadLayout;
