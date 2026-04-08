import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';

const InputField = ({
  label,
  value,
  onChangeText,
  placeholder,
  iconName,
  keyboardType = 'default',
  secureTextEntry = false,
  maxLength,
  editable = true,
  onPress,
  rightElement = null,
  multiline = false,
  inputStyle,
  containerStyle,
  placeholderTextColor = 'rgba(255,255,255,0.38)',
}) => {
  const [focused, setFocused] = useState(false);
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Wrapper
        onPress={onPress}
        activeOpacity={onPress ? 0.85 : 1}
        style={[
          styles.fieldWrap,
          focused ? styles.fieldWrapFocused : null,
          !editable ? styles.fieldWrapDisabled : null,
        ]}
      >
        {iconName ? (
          <Ionicons
            name={iconName}
            size={18}
            color={focused ? theme.colors.textPrimary : theme.colors.textSecondary}
            style={styles.icon}
          />
        ) : null}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          editable={editable && !onPress}
          style={[styles.input, multiline ? styles.multiline : null, inputStyle]}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline={multiline}
        />

        {rightElement}
      </Wrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    fontSize: theme.typography.caption,
    fontWeight: theme.typography.weights.medium,
  },
  fieldWrap: {
    minHeight: 52,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  fieldWrapFocused: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.secondarySoft,
  },
  fieldWrapDisabled: {
    opacity: 0.7,
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    paddingVertical: 10,
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
});

export default InputField;
