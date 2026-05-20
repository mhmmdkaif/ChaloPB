/**
 * FloatingLabelInput - Premium input with floating labels and glow effects
 */

import React, { useState } from "react";
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  Text,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface FloatingLabelInputProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: string;
}

export function FloatingLabelInput({
  label,
  error,
  icon,
  value,
  onFocus,
  onBlur,
  ...props
}: FloatingLabelInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const labelScale = useSharedValue(1);
  const labelY = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    labelScale.value = withTiming(0.75, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
    labelY.value = withTiming(-12, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
    glowOpacity.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    if (!value) {
      setIsFocused(false);
      labelScale.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
      labelY.value = withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    }
    glowOpacity.value = withTiming(0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
    onBlur?.(e);
  };

  const labelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: labelScale.value },
      { translateY: labelY.value },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.glowBorder,
          glowStyle,
          {
            borderColor: error ? "#ef4444" : "#60A5FA",
          },
        ]}
      />
      <View style={[styles.container, error && styles.containerError]}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <View style={styles.inputWrapper}>
          <Animated.Text
            style={[
              styles.label,
              labelAnimatedStyle,
              {
                color: error ? "#ef4444" : "#94A3B8",
              },
            ]}
          >
            {label}
          </Animated.Text>
          <TextInput
            {...props}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholderTextColor="transparent"
            style={styles.input}
          />
        </View>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 8,
  },
  glowBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#60A5FA",
    shadowColor: "#60A5FA",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: "rgba(15,23,42,0.4)",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  containerError: {
    borderColor: "rgba(239,68,68,0.3)",
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  inputWrapper: {
    flex: 1,
    justifyContent: "center",
  },
  label: {
    position: "absolute",
    fontSize: 14,
    fontWeight: "500",
    left: 0,
    color: "#94A3B8",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#FFFFFF",
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
    marginLeft: 4,
  },
});
