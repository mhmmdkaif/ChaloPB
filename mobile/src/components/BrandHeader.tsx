import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";

interface BrandHeaderProps {
  subtitle?: string;
  right?: React.ReactNode;
}

export function BrandHeader({ subtitle, right }: BrandHeaderProps) {
  return (
    <View style={styles.brand}>
      <View style={styles.brandContent}>
        <View style={styles.brandIcon}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Rect x={3} y={6} width={18} height={12} rx={2.5} fill="rgba(255,255,255,0.22)" />
            <Rect x={5.5} y={9} width={3.5} height={4} rx={1} fill="rgba(255,255,255,0.55)" />
            <Rect x={10.25} y={9} width={3.5} height={4} rx={1} fill="rgba(255,255,255,0.55)" />
            <Rect x={15} y={9} width={3.5} height={4} rx={1} fill="rgba(255,255,255,0.55)" />
            <Circle cx={7.5} cy={20} r={2} fill="rgba(255,255,255,0.38)" />
            <Circle cx={16.5} cy={20} r={2} fill="rgba(255,255,255,0.38)" />
          </Svg>
        </View>
        <View style={styles.textCol}>
          <Text style={styles.brandText}>ChaloPB</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {right && <View style={styles.rightCol}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  brandIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
  },
  brandText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    marginTop: 2,
    fontWeight: "600",
  },
  rightCol: {
    marginLeft: 12,
  },
});
