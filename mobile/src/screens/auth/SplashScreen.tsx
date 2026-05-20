/**
 * SplashScreen - Frontend-inspired ChaloPB launch animation.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Rect,
  Stop,
  Text as SvgText,
  LinearGradient,
} from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const { width: W, height: H } = Dimensions.get("window");
const MAP_H = H * 0.5;
const GRID_SIZE = 48;

const ROUTE = {
  start: { x: W * 0.08, y: MAP_H * 0.6 },
  stop1: { x: W * 0.35, y: MAP_H * 0.42 },
  stop2: { x: W * 0.62, y: MAP_H * 0.34 },
  end: { x: W * 0.88, y: MAP_H * 0.4 },
};

const routePath = [
  `M ${ROUTE.start.x} ${ROUTE.start.y}`,
  `C ${W * 0.18} ${MAP_H * 0.55} ${W * 0.28} ${MAP_H * 0.38} ${ROUTE.stop1.x} ${ROUTE.stop1.y}`,
  `C ${W * 0.44} ${MAP_H * 0.41} ${W * 0.55} ${MAP_H * 0.36} ${ROUTE.stop2.x} ${ROUTE.stop2.y}`,
  `C ${W * 0.72} ${MAP_H * 0.34} ${W * 0.8} ${MAP_H * 0.38} ${ROUTE.end.x} ${ROUTE.end.y}`,
].join(" ");

interface SplashScreenProps {
  onComplete: () => void;
}

function PulsingStop({
  cx,
  cy,
  delay = 0,
  color = "rgba(125,211,252,0.5)",
}: {
  cx: number;
  cy: number;
  delay?: number;
  color?: string;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 900, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      )
    );

    return () => cancelAnimation(pulse);
  }, [delay, pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 0.85 + pulse.value * 0.3 }],
  }));

  return (
    <Animated.View
      style={[
        styles.pulsingStop,
        style,
        {
          left: cx - 8,
          top: cy - 8,
          backgroundColor: color,
        },
      ]}
    />
  );
}

function AnimatedBus({ progress }: { progress: SharedValue<number> }) {
  const busStyle = useAnimatedStyle(() => {
    const t = progress.value;
    let x = ROUTE.start.x;
    let y = ROUTE.start.y;

    if (t < 0.33) {
      const p = t / 0.33;
      x = interpolate(p, [0, 1], [ROUTE.start.x, ROUTE.stop1.x]);
      y = interpolate(p, [0, 1], [ROUTE.start.y, ROUTE.stop1.y]);
    } else if (t < 0.66) {
      const p = (t - 0.33) / 0.33;
      x = interpolate(p, [0, 1], [ROUTE.stop1.x, ROUTE.stop2.x]);
      y = interpolate(p, [0, 1], [ROUTE.stop1.y, ROUTE.stop2.y]);
    } else {
      const p = (t - 0.66) / 0.34;
      x = interpolate(p, [0, 1], [ROUTE.stop2.x, ROUTE.end.x]);
      y = interpolate(p, [0, 1], [ROUTE.stop2.y, ROUTE.end.y]);
    }

    return {
      transform: [{ translateX: x - 12 }, { translateY: y - 7 }],
    };
  });

  return (
    <Animated.View style={[styles.bus, busStyle]}>
      <Svg width={24} height={14} viewBox="0 0 24 14">
        <Rect
          x={0}
          y={0}
          width={24}
          height={12}
          rx={3}
          fill="#1565a8"
          stroke="#7dd3fc"
          strokeWidth={1.2}
        />
        <Rect x={3} y={2} width={5} height={5} rx={1} fill="rgba(125,211,252,0.6)" />
        <Rect x={10} y={2} width={5} height={5} rx={1} fill="rgba(125,211,252,0.6)" />
        <Rect x={17} y={2} width={4} height={5} rx={1} fill="rgba(125,211,252,0.6)" />
        <Circle cx={5} cy={12} r={2.5} fill="#0f4f8c" stroke="#7dd3fc" strokeWidth={0.8} />
        <Circle cx={18} cy={12} r={2.5} fill="#0f4f8c" stroke="#7dd3fc" strokeWidth={0.8} />
        <Rect x={21} y={1} width={2.5} height={2} rx={0.5} fill="#fde68a" />
      </Svg>
    </Animated.View>
  );
}

function LivePill() {
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(0.18, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      false
    );

    return () => cancelAnimation(dotOpacity);
  }, [dotOpacity]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  return (
    <View style={styles.livePill}>
      <Animated.View style={[styles.liveDot, dotStyle]} />
      <Text style={styles.livePillText}>Live tracking active</Text>
    </View>
  );
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const containerOpacity = useSharedValue(1);
  const brandOpacity = useSharedValue(0);
  const brandTranslateY = useSharedValue(20);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslateY = useSharedValue(16);
  const pillOpacity = useSharedValue(0);
  const busProgress = useSharedValue(0);

  const isMountedRef = useRef(true);
  const outerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const innerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeComplete = useCallback(() => {
    if (isMountedRef.current) {
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    isMountedRef.current = true;

    pillOpacity.value = withDelay(300, withTiming(1, { duration: 500 }));
    brandOpacity.value = withDelay(
      550,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
    brandTranslateY.value = withDelay(
      550,
      withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
    taglineOpacity.value = withDelay(900, withTiming(1, { duration: 500 }));
    taglineTranslateY.value = withDelay(
      900,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    busProgress.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );

    outerTimer.current = setTimeout(() => {
      if (!isMountedRef.current) return;

      containerOpacity.value = withTiming(0, {
        duration: 500,
        easing: Easing.in(Easing.cubic),
      });
      innerTimer.current = setTimeout(safeComplete, 520);
    }, 3000);

    return () => {
      isMountedRef.current = false;
      if (outerTimer.current) clearTimeout(outerTimer.current);
      if (innerTimer.current) clearTimeout(innerTimer.current);
      cancelAnimation(containerOpacity);
      cancelAnimation(brandOpacity);
      cancelAnimation(brandTranslateY);
      cancelAnimation(taglineOpacity);
      cancelAnimation(taglineTranslateY);
      cancelAnimation(pillOpacity);
      cancelAnimation(busProgress);
    };
  }, [
    brandOpacity,
    brandTranslateY,
    busProgress,
    containerOpacity,
    pillOpacity,
    safeComplete,
    taglineOpacity,
    taglineTranslateY,
  ]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandOpacity.value,
    transform: [{ translateY: brandTranslateY.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }));
  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOpacity.value }));

  const gridCols = Math.ceil(W / GRID_SIZE) + 1;
  const gridRows = Math.ceil(H / GRID_SIZE) + 1;

  return (
    <Animated.View style={[styles.root, containerStyle]}>
      <View style={styles.bgBottom} />
      <View style={styles.bgMid} />
      <View style={styles.bgTop} />

      <View style={styles.blobTopLeft} />
      <View style={styles.blobBottomRight} />

      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: gridCols }).map((_, i) => (
          <Line
            key={`vc${i}`}
            x1={i * GRID_SIZE}
            y1={0}
            x2={i * GRID_SIZE}
            y2={H}
            stroke="rgba(255,255,255,0.24)"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: gridRows }).map((_, i) => (
          <Line
            key={`hr${i}`}
            x1={0}
            y1={i * GRID_SIZE}
            x2={W}
            y2={i * GRID_SIZE}
            stroke="rgba(255,255,255,0.24)"
            strokeWidth={1}
          />
        ))}
      </Svg>

      <View style={styles.decorCircleLarge} />
      <View style={styles.decorCircleSmall} />

      <View style={styles.mapContainer} pointerEvents="none">
        <Svg width={W} height={MAP_H} viewBox={`0 0 ${W} ${MAP_H}`}>
          <Defs>
            <LinearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <Stop offset="30%" stopColor="rgba(125,211,252,0.5)" />
              <Stop offset="70%" stopColor="rgba(125,211,252,0.5)" />
              <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </LinearGradient>
          </Defs>

          <Path
            d={routePath}
            stroke="rgba(255,255,255,0.34)"
            strokeWidth={3}
            fill="none"
            strokeDasharray="6 4"
          />
          <Path d={routePath} stroke="url(#routeGrad)" strokeWidth={1.8} fill="none" />

          <Circle cx={ROUTE.start.x} cy={ROUTE.start.y} r={5} fill="#ffffff" />
          <Circle cx={ROUTE.stop1.x} cy={ROUTE.stop1.y} r={5} fill="#ffffff" />
          <Circle cx={ROUTE.stop2.x} cy={ROUTE.stop2.y} r={5} fill="#ffffff" />
          <Circle cx={ROUTE.end.x} cy={ROUTE.end.y} r={6} fill="#7dd3fc" />

          <G>
            <SvgText x={ROUTE.start.x - 4} y={ROUTE.start.y + 17} fontSize={9} fill="rgba(255,255,255,0.78)" fontWeight="600">
              Ludhiana
            </SvgText>
            <SvgText x={ROUTE.stop1.x - 16} y={ROUTE.stop1.y - 10} fontSize={9} fill="rgba(255,255,255,0.78)" fontWeight="600">
              Phagwara
            </SvgText>
            <SvgText x={ROUTE.stop2.x - 18} y={ROUTE.stop2.y - 10} fontSize={9} fill="rgba(255,255,255,0.78)" fontWeight="600">
              Jalandhar
            </SvgText>
            <SvgText x={ROUTE.end.x - 22} y={ROUTE.end.y - 12} fontSize={9} fill="rgba(255,255,255,0.9)" fontWeight="600">
              Amritsar
            </SvgText>
          </G>

          <Rect
            x={ROUTE.end.x - 42}
            y={ROUTE.end.y - 38}
            width={78}
            height={18}
            rx={5}
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={0.8}
          />
          <Circle cx={ROUTE.end.x - 32} cy={ROUTE.end.y - 29} r={3} fill="#7dd3fc" />
          <SvgText x={ROUTE.end.x - 25} y={ROUTE.end.y - 25} fontSize={7.5} fill="rgba(255,255,255,0.85)">
            ETA: 12 mins
          </SvgText>
        </Svg>

        <PulsingStop cx={ROUTE.start.x} cy={ROUTE.start.y} delay={0} color="rgba(125,211,252,0.45)" />
        <PulsingStop cx={ROUTE.stop1.x} cy={ROUTE.stop1.y} delay={700} color="rgba(125,211,252,0.45)" />
        <PulsingStop cx={ROUTE.stop2.x} cy={ROUTE.stop2.y} delay={1400} color="rgba(125,211,252,0.45)" />
        <PulsingStop cx={ROUTE.end.x} cy={ROUTE.end.y} delay={0} color="rgba(125,211,252,0.7)" />
        <AnimatedBus progress={busProgress} />
      </View>

      <View style={styles.contentContainer}>
        <Animated.View style={pillStyle}>
          <LivePill />
        </Animated.View>

        <Animated.View style={brandStyle}>
          <Text style={styles.brand}>
            Chalo<Text style={styles.brandMuted}>PB</Text>
          </Text>
        </Animated.View>

        <Animated.View style={taglineStyle}>
          <Text style={styles.tagline}>
            {"Punjab's real-time bus tracking\nplatform for commuters & operators."}
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  bgBottom: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#e7eef8",
  },
  bgMid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#eef4ff",
    opacity: 0.7,
  },
  bgTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f7fafc",
    opacity: 0.5,
  },
  blobTopLeft: {
    position: "absolute",
    width: W * 0.9,
    height: W * 0.9,
    borderRadius: W * 0.45,
    backgroundColor: "rgba(29,111,164,0.13)",
    top: -W * 0.25,
    left: -W * 0.25,
  },
  blobBottomRight: {
    position: "absolute",
    width: W * 0.8,
    height: W * 0.8,
    borderRadius: W * 0.4,
    backgroundColor: "rgba(15,79,140,0.10)",
    bottom: -W * 0.2,
    right: -W * 0.2,
  },
  decorCircleLarge: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: -80,
    right: -60,
  },
  decorCircleSmall: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -30,
    left: -30,
  },
  mapContainer: {
    position: "absolute",
    top: H * 0.28,
    left: 0,
    right: 0,
    height: MAP_H,
  },
  pulsingStop: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  bus: {
    position: "absolute",
  },
  contentContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: H * 0.18,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    marginBottom: 18,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#7dd3fc",
  },
  livePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  brand: {
    fontSize: 58,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -2,
    textAlign: "center",
    lineHeight: 60,
    marginBottom: 14,
    textShadowColor: "rgba(15,79,140,0.35)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  brandMuted: {
    color: "#1565a8",
  },
  tagline: {
    fontSize: 13,
    fontWeight: "300",
    color: "rgba(255,255,255,0.62)",
    textAlign: "center",
    lineHeight: 20,
    letterSpacing: 0.2,
    maxWidth: 260,
  },
});

export default SplashScreen;
