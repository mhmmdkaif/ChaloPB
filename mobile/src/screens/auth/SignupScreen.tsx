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
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAuth } from "../../context/AuthContext";

const { width: W, height: H } = Dimensions.get("window");

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

function FloatingBusIcon() {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    return () => cancelAnimation(translateY);
  }, [translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.busIconWrap, style]}>
      <Svg width={72} height={44} viewBox="0 0 72 44">
        <Rect x={2} y={4} width={68} height={30} rx={8} fill="rgba(255,255,255,0.22)" />
        <Rect x={6} y={8} width={20} height={14} rx={3} fill="rgba(255,255,255,0.45)" />
        <Rect x={30} y={8} width={16} height={14} rx={3} fill="rgba(255,255,255,0.45)" />
        <Rect x={50} y={8} width={16} height={14} rx={3} fill="rgba(255,255,255,0.45)" />
        <Rect x={30} y={20} width={16} height={14} rx={2} fill="rgba(255,255,255,0.18)" />
        <Circle cx={16} cy={38} r={6} fill="rgba(255,255,255,0.2)" />
        <Circle cx={16} cy={38} r={3} fill="rgba(255,255,255,0.5)" />
        <Circle cx={56} cy={38} r={6} fill="rgba(255,255,255,0.2)" />
        <Circle cx={56} cy={38} r={3} fill="rgba(255,255,255,0.5)" />
        <Rect x={64} y={12} width={5} height={4} rx={1} fill="#fde68a" />
        <Rect x={8} y={24} width={18} height={8} rx={2} fill="rgba(125,211,252,0.35)" />
      </Svg>
    </Animated.View>
  );
}

function StatPills() {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(400, withTiming(1, { duration: 600 }));
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const stats = [
    { label: "Active Routes", val: "42+" },
    { label: "Daily Trips", val: "1,200+" },
    { label: "Cities", val: "12" },
  ];

  return (
    <Animated.View style={[styles.pillsRow, style]}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.statPill}>
          <Text style={styles.statVal}>{stat.val}</Text>
          <Text style={styles.statLabel}>{stat.label}</Text>
        </View>
      ))}
    </Animated.View>
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
  placeholder = "",
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  placeholder?: string;
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
        placeholder={placeholder}
        placeholderTextColor="rgba(148,163,184,0.6)"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrapper: { marginBottom: 13 },
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

export function SignupScreen({ navigation }: { navigation: any }) {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const heroOpacity = useSharedValue(0);
  const heroY = useSharedValue(12);
  const formOpacity = useSharedValue(0);
  const formY = useSharedValue(16);

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
    if (!name.trim() || !email.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await signup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
    } catch (err: any) {
      if (isMounted.current) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Signup failed. Please try again."
        );
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const heroH = H * 0.34;
  const cols = Math.ceil(W / 48) + 1;
  const rows = Math.ceil(heroH / 48) + 1;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.root}
    >
      <Animated.View style={[styles.heroPanel, { height: heroH }, heroStyle]}>
        <View style={styles.heroBgBase} />
        <View style={styles.heroBgMid} />

        <Svg width={W} height={heroH} style={StyleSheet.absoluteFill} pointerEvents="none">
          {Array.from({ length: cols }).map((_, i) => (
            <Line key={`v${i}`} x1={i * 48} y1={0} x2={i * 48} y2={heroH} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
          {Array.from({ length: rows }).map((_, i) => (
            <Line key={`h${i}`} x1={0} y1={i * 48} x2={W} y2={i * 48} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
        </Svg>

        <View style={[styles.decorCircle, styles.decorCircleTop]} />
        <View style={[styles.decorCircle, styles.decorCircleBottom]} />

        <View style={styles.heroContent}>
          <View style={styles.liveBadge}>
            <LiveDot />
            <Text style={styles.liveBadgeText}>Join thousands of commuters</Text>
          </View>

          <View style={styles.heroRow}>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroTitle}>
                Chalo<Text style={styles.heroTitleMuted}>PB</Text>
              </Text>
              <Text style={styles.heroTagline}>{"Punjab's bus\ntracking platform"}</Text>
            </View>
            <FloatingBusIcon />
          </View>

          <StatPills />
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

          <Text style={styles.formTitle}>Create account</Text>
          <Text style={styles.formSubtitle}>Start tracking Punjab buses today</Text>

          <View style={styles.fields}>
            <WebInput
              label="Full Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Your full name"
              editable={!loading}
            />
            <WebInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholder="you@example.com"
              editable={!loading}
            />
            <WebInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Min. 6 characters"
              editable={!loading}
            />
            <WebInput
              label="Confirm Password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="Repeat password"
              editable={!loading}
            />
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
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          >
            <Text style={styles.submitBtnText}>
              {loading ? "Creating account..." : "Create Account ->"}
            </Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")} disabled={loading}>
              <Text style={styles.loginLink}>Sign in</Text>
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
  heroPanel: {
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
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -65,
    right: -55,
  },
  decorCircleBottom: {
    width: 110,
    height: 110,
    borderRadius: 55,
    bottom: -20,
    left: -20,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroContent: {
    paddingTop: Platform.OS === "ios" ? 52 : 32,
    paddingHorizontal: 24,
    flex: 1,
    zIndex: 10,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
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
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTextCol: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 40,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -1.2,
    lineHeight: 42,
    textShadowColor: "rgba(0,0,0,0.18)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroTitleMuted: {
    color: "rgba(255,255,255,0.35)",
  },
  heroTagline: {
    fontSize: 12,
    fontWeight: "300",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 18,
    marginTop: 4,
  },
  busIconWrap: {
    marginLeft: 12,
  },
  pillsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  statPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statVal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginTop: 1,
    textAlign: "center",
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
    marginBottom: 16,
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
    color: "#93c5fd",
    fontWeight: "400",
    marginBottom: 24,
  },
  fields: {
    marginBottom: 4,
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.09)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12.5,
    color: "#dc2626",
    fontWeight: "500",
    lineHeight: 18,
  },
  submitBtn: {
    width: "100%",
    marginTop: 18,
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
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
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
  loginLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1565a8",
  },
});

export default SignupScreen;
