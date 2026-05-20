import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAuth } from "../../context/AuthContext";

const { width: W, height: H } = Dimensions.get("window");

const R = {
  s: { x: W * 0.06, y: 115 },
  p1: { x: W * 0.33, y: 88 },
  p2: { x: W * 0.62, y: 76 },
  e: { x: W * 0.88, y: 80 },
};

const routeD = [
  `M ${R.s.x} ${R.s.y}`,
  `C ${W * 0.16} ${R.s.y - 8} ${W * 0.26} ${R.p1.y + 4} ${R.p1.x} ${R.p1.y}`,
  `C ${W * 0.44} ${R.p1.y - 8} ${W * 0.55} ${R.p2.y + 4} ${R.p2.x} ${R.p2.y}`,
  `C ${W * 0.72} ${R.p2.y - 4} ${W * 0.8} ${R.e.y + 4} ${R.e.x} ${R.e.y}`,
].join(" ");

function LiveDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      false
    );

    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.liveDot, style]} />;
}

function AnimatedBus() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );

    return () => cancelAnimation(progress);
  }, [progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    let x = R.s.x;
    let y = R.s.y;

    if (t < 0.33) {
      const p = t / 0.33;
      x = interpolate(p, [0, 1], [R.s.x, R.p1.x]);
      y = interpolate(p, [0, 1], [R.s.y, R.p1.y]);
    } else if (t < 0.66) {
      const p = (t - 0.33) / 0.33;
      x = interpolate(p, [0, 1], [R.p1.x, R.p2.x]);
      y = interpolate(p, [0, 1], [R.p1.y, R.p2.y]);
    } else {
      const p = (t - 0.66) / 0.34;
      x = interpolate(p, [0, 1], [R.p2.x, R.e.x]);
      y = interpolate(p, [0, 1], [R.p2.y, R.e.y]);
    }

    return { transform: [{ translateX: x - 11 }, { translateY: y - 6 }] };
  });

  return (
    <Animated.View style={[styles.bus, style]}>
      <Svg width={22} height={13} viewBox="0 0 22 13">
        <Rect x={0} y={0} width={22} height={11} rx={2.5} fill="#1565a8" stroke="#7dd3fc" strokeWidth={1.1} />
        <Rect x={2.5} y={2} width={4} height={4} rx={0.8} fill="rgba(125,211,252,0.65)" />
        <Rect x={8} y={2} width={4} height={4} rx={0.8} fill="rgba(125,211,252,0.65)" />
        <Rect x={13.5} y={2} width={3.5} height={4} rx={0.8} fill="rgba(125,211,252,0.65)" />
        <Circle cx={5} cy={11} r={2} fill="#0f4f8c" stroke="#7dd3fc" strokeWidth={0.7} />
        <Circle cx={16} cy={11} r={2} fill="#0f4f8c" stroke="#7dd3fc" strokeWidth={0.7} />
        <Rect x={19.5} y={1} width={2} height={1.8} rx={0.4} fill="#fde68a" />
      </Svg>
    </Animated.View>
  );
}

function StopPulse({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.8, { duration: 900 }),
          withTiming(1, { duration: 900 })
        ),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.1, { duration: 900 }),
          withTiming(0.5, { duration: 900 })
        ),
        -1,
        false
      )
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [delay, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.stopPulse,
        style,
        {
          left: x - 7,
          top: y - 7,
        },
      ]}
    />
  );
}

function WebInput({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={inputStyles.wrapper}>
      <Text style={inputStyles.label}>{label.toUpperCase()}</Text>
      <TextInput
        style={[inputStyles.input, focused && inputStyles.inputFocused]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
        placeholderTextColor="#bae6fd"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1d6fa4",
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  input: {
    width: "100%",
    height: 46,
    backgroundColor: "#f0f9ff",
    borderWidth: 1.5,
    borderColor: "#bae6fd",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: "#1e3a5f",
  },
  inputFocused: {
    borderColor: "#1d6fa4",
    backgroundColor: "#ffffff",
    shadowColor: "#1d6fa4",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});

export function LoginScreen({ navigation }: { navigation: any }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroOpacity = useSharedValue(0);
  const heroY = useSharedValue(12);
  const formOpacity = useSharedValue(0);
  const formY = useSharedValue(16);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    heroOpacity.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
    heroY.value = withTiming(0, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
    formOpacity.value = withDelay(
      200,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
    formY.value = withDelay(
      200,
      withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) })
    );

    return () => {
      isMounted.current = false;
      cancelAnimation(heroOpacity);
      cancelAnimation(heroY);
      cancelAnimation(formOpacity);
      cancelAnimation(formY);
    };
  }, [formOpacity, formY, heroOpacity, heroY]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroY.value }],
  }));
  const formStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formY.value }],
  }));

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Login failed. Check your credentials."
      );
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const cols = Math.ceil(W / 48) + 1;
  const heroH = H * 0.42;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.root}
    >
      <Animated.View style={[styles.heroPanelOuter, { height: heroH }, heroStyle]}>
        <View style={styles.heroBgBase} />
        <View style={styles.heroBgMid} />

        <Svg width={W} height={heroH} style={StyleSheet.absoluteFill} pointerEvents="none">
          {Array.from({ length: cols }).map((_, i) => (
            <Line key={`v${i}`} x1={i * 48} y1={0} x2={i * 48} y2={heroH} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
          {Array.from({ length: Math.ceil(heroH / 48) + 1 }).map((_, i) => (
            <Line key={`h${i}`} x1={0} y1={i * 48} x2={W} y2={i * 48} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
        </Svg>

        <View style={[styles.decorCircle, styles.decorCircleTop]} />
        <View style={[styles.decorCircle, styles.decorCircleBottom]} />

        <View style={styles.heroBrandArea}>
          <View style={styles.liveBadge}>
            <LiveDot />
            <Text style={styles.liveBadgeText}>Live tracking active</Text>
          </View>
          <Text style={styles.heroTitle}>
            Chalo<Text style={styles.heroTitleMuted}>PB</Text>
          </Text>
          <Text style={styles.heroTagline}>
            {"Punjab's real-time bus tracking platform\nfor operators, drivers and commuters."}
          </Text>
        </View>

        <View style={styles.mapArea} pointerEvents="none">
          <Svg width={W} height={140} viewBox={`0 0 ${W} 140`}>
            <Path d={routeD} stroke="rgba(255,255,255,0.14)" strokeWidth={2.5} fill="none" strokeDasharray="6 4" strokeLinecap="round" />
            <Path d={routeD} stroke="rgba(125,211,252,0.5)" strokeWidth={1.5} fill="none" strokeLinecap="round" />

            <Circle cx={R.s.x} cy={R.s.y} r={4.5} fill="#ffffff" />
            <Circle cx={R.p1.x} cy={R.p1.y} r={4.5} fill="#ffffff" />
            <Circle cx={R.p2.x} cy={R.p2.y} r={4.5} fill="#ffffff" />
            <Circle cx={R.e.x} cy={R.e.y} r={5.5} fill="#7dd3fc" />

            <SvgText x={R.s.x} y={R.s.y + 15} fontSize={8} fill="rgba(255,255,255,0.8)" fontWeight="600" textAnchor="middle">Ludhiana</SvgText>
            <SvgText x={R.p1.x} y={R.p1.y - 10} fontSize={8} fill="rgba(255,255,255,0.8)" fontWeight="600" textAnchor="middle">Phagwara</SvgText>
            <SvgText x={R.p2.x} y={R.p2.y - 10} fontSize={8} fill="rgba(255,255,255,0.8)" fontWeight="600" textAnchor="middle">Jalandhar</SvgText>
            <SvgText x={R.e.x} y={R.e.y - 12} fontSize={8} fill="rgba(255,255,255,0.95)" fontWeight="600" textAnchor="middle">Amritsar</SvgText>

            <Rect x={R.e.x - 40} y={R.e.y - 36} width={72} height={16} rx={4} fill="rgba(255,255,255,0.13)" stroke="rgba(255,255,255,0.22)" strokeWidth={0.8} />
            <Circle cx={R.e.x - 30} cy={R.e.y - 28} r={2.8} fill="#7dd3fc" />
            <SvgText x={R.e.x - 24} y={R.e.y - 24} fontSize={7} fill="rgba(255,255,255,0.85)">ETA: 12 mins</SvgText>
          </Svg>

          <StopPulse x={R.s.x} y={R.s.y} delay={0} />
          <StopPulse x={R.p1.x} y={R.p1.y} delay={700} />
          <StopPulse x={R.p2.x} y={R.p2.y} delay={1400} />
          <StopPulse x={R.e.x} y={R.e.y} delay={0} />
          <AnimatedBus />
        </View>
      </Animated.View>

      <Animated.View style={[styles.formPanel, formStyle]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoBadge}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="M3 17h18M5 17V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8M9 17v2m6-2v2M7 13h2m4 0h2"
                stroke="#ffffff"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>

          <Text style={styles.formTitle}>Welcome back</Text>
          <Text style={styles.formSubtitle}>Sign in to ChaloPB</Text>

          <View style={styles.fields}>
            <WebInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />

            <View>
              <View style={styles.passwordHeader}>
                <Text style={inputStyles.label}>PASSWORD</Text>
                <TouchableOpacity disabled={loading}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={inputStyles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                placeholderTextColor="#bae6fd"
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.88}
            style={[styles.signInBtn, loading && styles.signInBtnDisabled]}
          >
            <Text style={styles.signInBtnText}>
              {loading ? "Signing in..." : "Sign In ->"}
            </Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New here? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Signup")} disabled={loading}>
              <Text style={styles.signupLink}>Create account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  heroPanelOuter: {
    width: "100%",
    overflow: "hidden",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroBgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f4f8c",
  },
  heroBgMid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1d6fa4",
    opacity: 0.65,
  },
  decorCircle: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  decorCircleTop: {
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -70,
    right: -60,
  },
  decorCircleBottom: {
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -25,
    left: -25,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroBrandArea: {
    paddingTop: Platform.OS === "ios" ? 52 : 36,
    paddingHorizontal: 24,
    zIndex: 10,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#7dd3fc",
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -1.5,
    lineHeight: 50,
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroTitleMuted: {
    color: "rgba(255,255,255,0.38)",
  },
  heroTagline: {
    fontSize: 12.5,
    fontWeight: "300",
    color: "rgba(255,255,255,0.62)",
    lineHeight: 19,
  },
  mapArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  bus: {
    position: "absolute",
  },
  stopPulse: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(125,211,252,0.5)",
  },
  formPanel: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: "#1d6fa4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1e3a5f",
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: "#93c5fd",
    marginBottom: 26,
  },
  fields: {
    marginBottom: 6,
  },
  passwordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  forgotText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#1d6fa4",
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.09)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12.5,
    color: "#dc2626",
    fontWeight: "500",
    lineHeight: 18,
  },
  signInBtn: {
    width: "100%",
    marginTop: 20,
    backgroundColor: "#1565a8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#1565a8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  signInBtnDisabled: {
    opacity: 0.6,
  },
  signInBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    fontSize: 13,
    color: "#93c5fd",
  },
  signupLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1565a8",
  },
});

export default LoginScreen;
