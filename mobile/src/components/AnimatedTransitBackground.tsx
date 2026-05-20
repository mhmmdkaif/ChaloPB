/**
 * AnimatedTransitBackground - Mobile-optimized futuristic transit network
 * Inspired by website's UserBg.jsx but optimized for mobile performance
 */

import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Svg, {
  Path,
  Circle,
  Rect,
  Defs,
  LinearGradient,
  Stop,
  G,
  Text as SvgText,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

const { width: W, height: H } = Dimensions.get("window");

interface AnimatedTransitBackgroundProps {
  children?: React.ReactNode;
}

export function AnimatedTransitBackground({
  children,
}: AnimatedTransitBackgroundProps) {
  // Animated values for bus movements
  const bus1Offset = useSharedValue(0);
  const bus2Offset = useSharedValue(0);
  const bus3Offset = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // Bus 1 animation - starts immediately
    bus1Offset.value = withRepeat(
      withTiming(100, {
        duration: 8000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );

    // Bus 2 animation - staggered start via withDelay
    bus2Offset.value = withDelay(
      5000,
      withRepeat(
        withTiming(100, {
          duration: 10000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      )
    );

    // Bus 3 animation - staggered start via withDelay
    bus3Offset.value = withDelay(
      3000,
      withRepeat(
        withTiming(100, {
          duration: 9000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      )
    );

    // Pulse animation
    pulseScale.value = withRepeat(
      withTiming(1.2, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );

    return () => {
      // Cancel all animations on unmount
      cancelAnimation(bus1Offset);
      cancelAnimation(bus2Offset);
      cancelAnimation(bus3Offset);
      cancelAnimation(pulseScale);
    };
  }, [bus1Offset, bus2Offset, bus3Offset, pulseScale]);

  const bus1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bus1Offset.value }],
  }));

  const bus2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bus2Offset.value }],
  }));

  const bus3Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bus3Offset.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Gradient background - RN compatible */}
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "#0F172A",
        }}
      />

      {/* SVG canvas for roads and animations */}
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <Stop offset="50%" stopColor="rgba(96,165,250,0.12)" />
            <Stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
          </LinearGradient>
          <LinearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#60A5FA" stopOpacity="0.3" />
            <Stop offset="100%" stopColor="#1E40AF" stopOpacity="0.1" />
          </LinearGradient>
        </Defs>

        {/* Main horizontal road */}
        <Path
          d={`M 0 ${H * 0.4} Q ${W * 0.25} ${H * 0.35} ${W * 0.5} ${H * 0.38} T ${W} ${H * 0.42}`}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3"
          fill="none"
        />
        <Path
          d={`M 0 ${H * 0.4} Q ${W * 0.25} ${H * 0.35} ${W * 0.5} ${H * 0.38} T ${W} ${H * 0.42}`}
          stroke="url(#roadGrad)"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="10 8"
          opacity="0.6"
        />

        {/* Secondary vertical road */}
        <Path
          d={`M ${W * 0.35} 0 Q ${W * 0.32} ${H * 0.25} ${W * 0.38} ${H * 0.5} T ${W * 0.4} ${H}`}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="2.5"
          fill="none"
        />
        <Path
          d={`M ${W * 0.35} 0 Q ${W * 0.32} ${H * 0.25} ${W * 0.38} ${H * 0.5} T ${W * 0.4} ${H}`}
          stroke="rgba(167,243,208,0.35)"
          strokeWidth="1"
          fill="none"
          strokeDasharray="8 6"
        />

        {/* Diagonal road */}
        <Path
          d={`M 0 ${H * 0.7} Q ${W * 0.3} ${H * 0.5} ${W * 0.6} ${H * 0.3} T ${W} 0`}
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="2.5"
          fill="none"
        />

        {/* Intersection nodes */}
        <Circle cx={W * 0.35} cy={H * 0.4} r="6" fill="rgba(255,255,255,0.8)" />
        <Circle cx={W * 0.35} cy={H * 0.4} r="12" fill="none" stroke="rgba(96,165,250,0.2)" strokeWidth="1.5" />

        <Circle cx={W * 0.65} cy={H * 0.55} r="5.5" fill="rgba(255,255,255,0.7)" />
        <Circle cx={W * 0.65} cy={H * 0.55} r="11" fill="none" stroke="rgba(253,230,138,0.18)" strokeWidth="1.5" />

        {/* Major transit hub */}
        <G key="pulse-hub">
          <Circle cx={W * 0.5} cy={H * 0.5} r="8" fill="rgba(96,165,250,0.9)" />
          <Circle cx={W * 0.5} cy={H * 0.5} r="15" fill="none" stroke="rgba(96,165,250,0.2)" strokeWidth="1" />
          <Circle cx={W * 0.5} cy={H * 0.5} r="22" fill="none" stroke="rgba(96,165,250,0.08)" strokeWidth="1.5" opacity="0.5" />
        </G>

        {/* Bus 1 - top horizontal */}
        <G key="bus1">
          <Rect x={W * 0.1} y={H * 0.37} width="16" height="10" rx="2" fill="#2563EB" stroke="#60A5FA" strokeWidth="1" />
          <Circle cx={W * 0.1 + 3} cy={H * 0.42} r="1.8" fill="#0F172A" />
          <Circle cx={W * 0.1 + 11} cy={H * 0.42} r="1.8" fill="#0F172A" />
          <Rect x={W * 0.1 + 3} y={H * 0.375} width="3" height="2.5" rx="0.5" fill="rgba(96,165,250,0.6)" />
          <Rect x={W * 0.1 + 8} y={H * 0.375} width="3" height="2.5" rx="0.5" fill="rgba(96,165,250,0.6)" />
        </G>

        {/* Bus 2 - vertical road */}
        <G key="bus2">
          <Rect x={W * 0.33} y={H * 0.15} width="12" height="8" rx="1.5" fill="#059669" stroke="#A7F3D0" strokeWidth="0.8" />
          <Circle cx={W * 0.33 + 2.5} cy={H * 0.18} r="1.4" fill="#0F172A" />
          <Circle cx={W * 0.33 + 7.5} cy={H * 0.18} r="1.4" fill="#0F172A" />
        </G>

        {/* Bus 3 - diagonal */}
        <G key="bus3">
          <Rect x={W * 0.7} y={H * 0.25} width="15" height="9" rx="2" fill="#7C3AED" stroke="#C4B5FD" strokeWidth="0.9" />
          <Circle cx={W * 0.7 + 3} cy={H * 0.29} r="1.6" fill="#0F172A" />
          <Circle cx={W * 0.7 + 10} cy={H * 0.29} r="1.6" fill="#0F172A" />
          <Rect x={W * 0.7 + 12} y={H * 0.26} width="2" height="1.5" fill="#FDE68A" />
        </G>

        {/* City labels with subtle glow */}
        <G opacity="0.75">
          <SvgText x={W * 0.15} y={H * 0.25} fontSize="10" fill="rgba(96,165,250,0.7)" fontWeight="600">
            Ludhiana
          </SvgText>
          <SvgText x={W * 0.5} y={H * 0.68} fontSize="9" fill="rgba(253,230,138,0.6)" fontWeight="600">
            Chandigarh
          </SvgText>
          <SvgText x={W * 0.75} y={H * 0.15} fontSize="9" fill="rgba(167,243,208,0.6)" fontWeight="600">
            Pathankot
          </SvgText>
        </G>
      </Svg>

      {/* Subtle overlay - RN compatible */}
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(255,255,255,0.01)",
          opacity: 0.3,
        }}
      />

      {/* Decorative glowing blobs - RN compatible */}
      <View
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: "rgba(96,165,250,0.08)",
          top: -100,
          right: -100,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 250,
          height: 250,
          borderRadius: 125,
          backgroundColor: "rgba(167,243,208,0.06)",
          bottom: -80,
          left: -60,
        }}
      />

      {/* Content layer */}
      <View style={styles.contentContainer}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  contentContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
});
