import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput as RNTextInput,
  TextInputProps,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
} from "react-native";
import { COLORS, SPACING, BORDER_RADIUS } from "../constants/config";

type ButtonProps = {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
};

export function Button({ label, onPress, style, labelStyle, variant = "primary", disabled = false }: ButtonProps) {
  const background = variant === "primary" ? COLORS.primary : variant === "danger" ? COLORS.danger : COLORS.gray200;
  const textColor = variant === "primary" ? COLORS.white : variant === "danger" ? COLORS.white : COLORS.gray800;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, { backgroundColor: background, opacity: disabled ? 0.6 : 1 }, style]}
    >
      <Text style={[styles.buttonLabel, { color: textColor }, labelStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const Component = onPress ? TouchableOpacity : View;
  return (
    <Component style={[styles.card, style]} onPress={onPress} activeOpacity={0.7}>
      {children}
    </Component>
  );
}

export function Badge({ label, variant = "pending" }: { label: string; variant?: string }) {
  const background = useMemo(() => {
    switch (variant) {
      case "departed":
        return COLORS.gray300;
      case "approaching":
        return "#1d4ed8"; // blue
      case "arrived":
        return COLORS.success;
      case "primary":
        return COLORS.primary;
      case "pending":
      default:
        return COLORS.gray200;
    }
  }, [variant]);

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      <TouchableOpacity
        onPress={() => {
          setVisible(false);
          onDismiss?.();
        }}
        style={styles.errorDismiss}
      >
        <Text style={styles.errorDismissText}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

export function TextInput({ style, ...props }: TextInputProps & { icon?: string; style?: ViewStyle }) {
  return <RNTextInput placeholderTextColor={COLORS.gray500} style={[styles.input, style]} {...props} />;
}

// StopTimeline component
export type StopItem = {
  id: number | string;
  name: string;
  state?: "departed" | "approaching" | "arrived" | "pending";
  etaMinutes?: number | null;
};

export function StopTimeline({ stops }: { stops: StopItem[] }) {
  return (
    <View style={styles.timelineContainer}>
      {stops.map((stop, idx) => {
        const isLast = idx === stops.length - 1;
        const color = stop.state === "arrived" ? COLORS.success : stop.state === "approaching" ? "#1d4ed8" : stop.state === "departed" ? COLORS.gray400 : COLORS.gray200;

        return (
          <View key={String(stop.id)} style={styles.timelineRow}>
            <View style={styles.timelineLeft}>
              <View style={[styles.timelineDot, { backgroundColor: color }]} />
              {!isLast && <View style={[styles.timelineLine, { backgroundColor: COLORS.gray300 }]} />}
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>{stop.name}</Text>
              {typeof stop.etaMinutes === "number" && (
                <Text style={styles.timelineEta}>{stop.etaMinutes} min</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.gray800,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    shadowColor: COLORS.gray800,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 9999,
    alignSelf: "flex-start",
  },
  badgeLabel: {
    color: COLORS.white,
    fontWeight: "600",
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: COLORS.danger,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: SPACING.sm,
  },
  errorText: { color: COLORS.white, fontWeight: "600" },
  errorDismiss: { marginLeft: SPACING.md },
  errorDismissText: { color: COLORS.white, fontWeight: "700" },
  input: {
    backgroundColor: COLORS.gray100,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    color: COLORS.gray900,
    fontSize: 16,
  },
  timelineContainer: { paddingVertical: SPACING.sm },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: SPACING.md },
  timelineLeft: { width: 32, alignItems: "center" },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, marginTop: 6 },
  timelineContent: { flex: 1, paddingLeft: SPACING.sm },
  timelineTitle: { fontSize: 14, fontWeight: "600", color: COLORS.gray800 },
  timelineEta: { fontSize: 12, color: COLORS.gray500, marginTop: 4 },
});

export default {
  Button,
  Card,
  Badge,
  ErrorBanner,
  TextInput,
  StopTimeline,
};
