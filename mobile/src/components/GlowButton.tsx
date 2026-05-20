/**
 * GlowButton - Premium button with glow effects and scale animations
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface GlowButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline";
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function GlowButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  style,
  textStyle,
}: GlowButtonProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  const handlePressIn = () => {
    scale.value = withSpring(0.95, {
      damping: 10,
      mass: 1,
      stiffness: 100,
    });
    glowOpacity.value = withTiming(1, {
      duration: 150,
      easing: Easing.out(Easing.cubic),
    });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {
      damping: 10,
      mass: 1,
      stiffness: 100,
    });
    glowOpacity.value = withTiming(0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const variantStyle = {
    primary: styles.primaryButton,
    secondary: styles.secondaryButton,
    outline: styles.outlineButton,
  }[variant];

  const variantTextStyle = {
    primary: styles.primaryText,
    secondary: styles.secondaryText,
    outline: styles.outlineText,
  }[variant];

  return (
    <Animated.View style={animatedStyle}>
      <Animated.View
        style={[
          styles.glowContainer,
          glowStyle,
          {
            backgroundColor:
              variant === "primary"
                ? "rgba(37, 99, 235, 0.4)"
                : "rgba(96, 165, 250, 0.2)",
          },
        ]}
      />
      <AnimatedTouchable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[variantStyle, style, disabled && styles.disabled]}
        activeOpacity={0.9}
      >
        <Text style={[variantTextStyle, textStyle]}>
          {loading ? "Loading..." : label}
        </Text>
      </AnimatedTouchable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glowContainer: {
    position: "absolute",
    inset: -4,
    borderRadius: 8,
    backgroundColor: "rgba(37, 99, 235, 0.3)",
    shadowColor: "#2563EB",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.4)",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  secondaryButton: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  outlineButton: {
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#60A5FA",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  secondaryText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
  outlineText: {
    color: "#60A5FA",
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
});
