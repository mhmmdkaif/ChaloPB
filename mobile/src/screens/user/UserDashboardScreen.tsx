import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Keyboard,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { API_ENDPOINTS, SEARCH_REFRESH_MS, BORDER_RADIUS, SPACING } from "../../constants/config";
import { useAuth } from "../../context/AuthContext";
import { getApi } from "../../services/api";
import { LiveDot, BrandHeader } from "../../components";
import { getFirstName, getInitials } from "../../utils/helpers";

const { width: W, height: H } = Dimensions.get("window");

type Stop = { id: number; stop_name: string };
type Bus = {
  trip_id: number;
  bus_id?: number;
  bus_number: string;
  stops_away?: number;
  eta_to_source?: string;
  eta_to_destination?: string;
};
type RouteGroup = { route: string; buses: Bus[] };

function stopsAwayColor(stopsAway: number): { bg: string; color: string } {
  if (!Number.isFinite(stopsAway)) {
    return { bg: "rgba(148,163,184,0.14)", color: "#475569" };
  }
  if (stopsAway <= 1) return { bg: "rgba(34,197,94,0.16)", color: "#166534" };
  if (stopsAway <= 3) return { bg: "rgba(245,158,11,0.16)", color: "#92400e" };
  return { bg: "rgba(148,163,184,0.14)", color: "#475569" };
}

function normalizeRoutes(payload: any): RouteGroup[] {
  const raw =
    payload?.data?.data ??
    payload?.data ??
    payload?.routes ??
    payload?.result ??
    payload ??
    [];

  if (!Array.isArray(raw)) return [];

  return raw
    .map((group: any) => {
      const route = String(group?.route ?? group?.route_name ?? group?.routeNumber ?? "").trim();
      const busesRaw = group?.buses ?? group?.trips ?? group?.data ?? [];
      const buses = Array.isArray(busesRaw)
        ? busesRaw
            .map((b: any) => ({
              trip_id: Number(b?.trip_id ?? b?.tripId ?? b?.id ?? 0),
              bus_id: b?.bus_id ?? b?.busId,
              bus_number: String(b?.bus_number ?? b?.busNumber ?? b?.number ?? ""),
              stops_away:
                b?.stops_away != null
                  ? Number(b.stops_away)
                  : b?.stopsAway != null
                    ? Number(b.stopsAway)
                    : undefined,
              eta_to_source: b?.eta_to_source ?? b?.etaToSource ?? b?.eta,
              eta_to_destination: b?.eta_to_destination ?? b?.etaToDestination,
            }))
            .filter((b: Bus) => b.trip_id && b.bus_number)
        : [];

      if (!route) return null;
      return { route, buses };
    })
    .filter(Boolean) as RouteGroup[];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function ShimmerBar({
  w,
  h,
  radius = 6,
  shimmerStyle,
}: {
  w: number | `${number}%`;
  h: number;
  radius?: number;
  shimmerStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  return (
    <View style={[sk.shimmerTrack, { width: w, height: h, borderRadius: radius }]}>
      <Animated.View style={[sk.shimmerBar, shimmerStyle]} />
    </View>
  );
}

function SkeletonCard() {
  const x = useSharedValue(-160);

  useEffect(() => {
    x.value = withRepeat(
      withTiming(260, { duration: 1400, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(x);
  }, [x]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View style={sk.card}>
      {[0, 1].map((item) => (
        <View key={item} style={[sk.row, item === 0 && sk.borderBottom]}>
          <ShimmerBar w={40} h={40} radius={10} shimmerStyle={shimmerStyle} />
          <View style={sk.skeletonTextCol}>
            <ShimmerBar w="52%" h={13} shimmerStyle={shimmerStyle} />
            <ShimmerBar w="32%" h={11} shimmerStyle={shimmerStyle} />
          </View>
          <ShimmerBar w={64} h={28} radius={8} shimmerStyle={shimmerStyle} />
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
    marginTop: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 12,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  skeletonTextCol: {
    flex: 1,
    marginLeft: 12,
    gap: 8,
  },
  shimmerTrack: {
    backgroundColor: "rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  shimmerBar: {
    width: 120,
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
});

function EmptyState({ hasSearched }: { hasSearched: boolean }) {
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

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={em.wrap}>
      <Animated.View style={floatStyle}>
        <Svg width={54} height={54} viewBox="0 0 120 120" fill="none">
          <Rect x={12} y={27} width={96} height={55} rx={12} fill="rgba(21,101,168,0.12)" />
          <Rect x={20} y={37} width={80} height={28} rx={6} fill="rgba(21,101,168,0.08)" />
          <Rect x={24} y={41} width={20} height={16} rx={3} fill="rgba(21,101,168,0.3)" />
          <Rect x={50} y={41} width={20} height={16} rx={3} fill="rgba(21,101,168,0.3)" />
          <Rect x={76} y={41} width={20} height={16} rx={3} fill="rgba(21,101,168,0.3)" />
          <Rect x={50} y={59} width={20} height={23} rx={3} fill="rgba(21,101,168,0.15)" />
          <Circle cx={32} cy={89} r={10} fill="rgba(21,101,168,0.1)" />
          <Circle cx={32} cy={89} r={5} fill="rgba(21,101,168,0.25)" />
          <Circle cx={88} cy={89} r={10} fill="rgba(21,101,168,0.1)" />
          <Circle cx={88} cy={89} r={5} fill="rgba(21,101,168,0.25)" />
        </Svg>
      </Animated.View>
      <Text style={em.title}>
        {hasSearched ? "No buses on this route" : "Where are you headed?"}
      </Text>
      <Text style={em.sub}>
        {hasSearched
          ? "No active buses right now. Results refresh automatically."
          : "Pick a source and destination stop above to see live buses."}
      </Text>
    </View>
  );
}

const em = StyleSheet.create({
  wrap: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(21,101,168,0.12)",
    borderStyle: "dashed",
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 18,
    marginBottom: 6,
    textAlign: "center",
  },
  sub: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 260,
  },
});

function BusIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 17h18M5 17V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8M9 17v2m6-2v2M7 13h2m4 0h2"
        stroke="#ffffff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Circle cx={6.5} cy={6.5} r={5} stroke="#ffffff" strokeWidth={1.4} />
      <Path d="M10.5 10.5L14 14" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function SwapIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 20 20" fill="none">
      <Path
        d="M4 6h11M12.5 3.5L15 6l-2.5 2.5M16 14H5M7.5 11.5L5 14l2.5 2.5"
        stroke="#94a3b8"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Memoized SVG grid overlay — pure decoration, never changes */
const BackgroundGrid = React.memo(function BackgroundGrid() {
  const cols = useMemo(() => Math.ceil(W / 48) + 1, []);
  const rows = useMemo(() => Math.ceil(H / 48) + 1, []);

  return (
    <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: cols }).map((_, i) => (
        <Line
          key={`v${i}`}
          x1={i * 48}
          y1={0}
          x2={i * 48}
          y2={H}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: rows }).map((_, i) => (
        <Line
          key={`h${i}`}
          x1={0}
          y1={i * 48}
          x2={W}
          y2={i * 48}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
});

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  const opacityValue = useSharedValue(0);

  useEffect(() => {
    if (!message) {
      opacityValue.value = 0;
      return undefined;
    }

    // Animate in
    opacityValue.value = withTiming(1, { duration: 250 });

    // Auto-dismiss after 5750ms
    const timer = setTimeout(() => {
      opacityValue.value = withTiming(0, { duration: 250 }, () => {
        runOnJS(onClose)();
      });
    }, 5750);

    return () => clearTimeout(timer);
  }, [message, onClose]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacityValue.value,
  }));

  if (!message) return null;

  return (
    <Animated.View style={[eb.wrap, animStyle]}>
      <Text style={eb.text}>{message}</Text>
      <TouchableOpacity onPress={onClose} style={eb.close}>
        <Text style={eb.closeText}>x</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const eb = StyleSheet.create({
  wrap: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.26)",
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: "#b91c1c",
    lineHeight: 18,
  },
  close: {
    padding: 4,
    marginLeft: 8,
  },
  closeText: {
    color: "rgba(185,28,28,0.7)",
    fontSize: 18,
    lineHeight: 18,
  },
});

function Dropdown({ items, onSelect }: { items: Stop[]; onSelect: (stop: Stop) => void }) {
  if (!items.length) return null;

  return (
    <View style={dd.wrap}>
      {items.map((stop, index) => (
        <TouchableOpacity
          key={stop.id}
          onPress={() => onSelect(stop)}
          style={[dd.item, index < items.length - 1 && dd.borderBottom]}
        >
          <Text style={dd.text}>{stop.stop_name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const dd = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 50,
    left: 0,
    right: 0,
    top: "100%",
    marginTop: 4,
    backgroundColor: "#ffffff",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    overflow: "hidden",
  },
  item: {
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  text: {
    fontSize: 13,
    color: "#0f172a",
  },
});

function BusRow({ bus, onTrack }: { bus: Bus; onTrack: () => void }) {
  const stopsNum = Number.isFinite(Number(bus.stops_away))
    ? Number(bus.stops_away)
    : null;
  const stopsColor = stopsNum != null ? stopsAwayColor(stopsNum) : null;

  return (
    <View style={br.row}>
      <View style={br.icon}>
        <BusIcon />
      </View>
      <View style={br.info}>
        <View style={br.topRow}>
          <Text style={br.busNum}>{bus.bus_number}</Text>
          {stopsNum != null && stopsColor && (
            <View style={[br.badge, { backgroundColor: stopsColor.bg }]}>
              <Text style={[br.badgeText, { color: stopsColor.color }]}>
                {stopsNum} stops away
              </Text>
            </View>
          )}
        </View>
        <Text style={br.eta}>
          Arriving in <Text style={br.etaHighlight}>{bus.eta_to_source ?? "--"}</Text>
          {bus.eta_to_destination && (
            <Text style={br.eta}>
              {" - reaches in "}
              <Text style={br.etaHighlight}>{bus.eta_to_destination}</Text>
            </Text>
          )}
        </Text>
      </View>
      <TouchableOpacity onPress={onTrack} style={br.trackBtn} activeOpacity={0.8}>
        <Text style={br.trackText}>Track</Text>
        <Svg width={12} height={12} viewBox="0 0 16 16" fill="none">
          <Path
            d="M3 8h10M9.5 4.5L13 8l-3.5 3.5"
            stroke="#ffffff"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

const br = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(248,250,252,0.9)",
    gap: 12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    flexShrink: 0,
    backgroundColor: "#1565a8",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1565a8",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  busNum: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  eta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 3,
    lineHeight: 18,
  },
  etaHighlight: {
    color: "#1565a8",
    fontWeight: "600",
  },
  trackBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 7,
    flexShrink: 0,
    backgroundColor: "#1565a8",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trackText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
});

function RouteCard({ group, navigation }: { group: RouteGroup; navigation: any }) {
  return (
    <View style={rc.card}>
      <View style={rc.header}>
        <View style={rc.routeBadge}>
          <Text style={rc.routeText}>{group.route}</Text>
        </View>
      </View>
      {group.buses.map((bus) => (
        <BusRow
          key={bus.trip_id}
          bus={bus}
          onTrack={() => navigation.navigate("TrackTrip", { tripId: bus.trip_id })}
        />
      ))}
    </View>
  );
}

const rc = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(248,250,252,0.9)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226,232,240,0.6)",
  },
  routeBadge: {
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  routeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1565a8",
    letterSpacing: 0.3,
  },
});

function ResultsSection({
  routes,
  sortedRoutes,
  totalBuses,
  sortMode,
  setSortMode,
  navigation,
}: {
  routes: RouteGroup[];
  sortedRoutes: RouteGroup[];
  totalBuses: number;
  sortMode: "nearest" | "all";
  setSortMode: (mode: "nearest" | "all") => void;
  navigation: any;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = 0; // Reset synchronously before animating
    opacity.value = withTiming(1, { duration: 350 });
    return () => cancelAnimation(opacity);
  }, [opacity, routes]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={style}>
      <View style={styles.metaBar}>
        <View style={styles.metaLeft}>
          <Text style={styles.metaCount}>{totalBuses} buses found</Text>
          <View style={styles.livePill}>
            <LiveDot color="#86efac" />
            <Text style={styles.liveText}>live</Text>
          </View>
        </View>
        <View style={styles.sortRow}>
          {(["nearest", "all"] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              onPress={() => setSortMode(mode)}
              style={[styles.sortBtn, sortMode === mode && styles.sortBtnActive]}
            >
              <Text
                style={[
                  styles.sortBtnText,
                  sortMode === mode && styles.sortBtnTextActive,
                ]}
              >
                {mode === "nearest" ? "Nearest" : "All"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.liveAutoRow}>
        <LiveDot color="#10b981" />
        <Text style={styles.liveAutoText}>LIVE - auto-updating</Text>
      </View>

      {sortedRoutes.map((routeGroup, index) => (
        <RouteCard
          key={`${routeGroup.route}-${index}`}
          group={routeGroup}
          navigation={navigation}
        />
      ))}
    </Animated.View>
  );
}

export function UserDashboardScreen({ navigation }: any) {
  const { user, logout } = useAuth();

  const [stops, setStops] = useState<Stop[]>([]);
  const [sourceInput, setSourceInput] = useState("");
  const [destInput, setDestInput] = useState("");
  const [sourceStop, setSourceStop] = useState<Stop | null>(null);
  const [destStop, setDestStop] = useState<Stop | null>(null);
  const [showSourceDrop, setShowSourceDrop] = useState(false);
  const [showDestDrop, setShowDestDrop] = useState(false);
  const [routes, setRoutes] = useState<RouteGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [stopsError, setStopsError] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortMode, setSortMode] = useState<"nearest" | "all">("nearest");
  const [lastSearch, setLastSearch] = useState<{ source: Stop; dest: Stop } | null>(
    null
  );

  const allowAutoRef = useRef(false);
  const isMounted = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const greetOpacity = useSharedValue(0);
  const greetY = useSharedValue(12);
  const cardOpacity = useSharedValue(0);
  const cardY = useSharedValue(12);

  useEffect(() => {
    isMounted.current = true;
    greetOpacity.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
    greetY.value = withTiming(0, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
    cardOpacity.value = withDelay(
      130,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
    );
    cardY.value = withDelay(
      130,
      withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) })
    );

    getApi()
      .get(API_ENDPOINTS.stops as string, { params: { limit: 500 } })
      .then((res) => {
        if (!isMounted.current) return;
        setStops(Array.isArray(res.data?.data) ? res.data.data : []);
        setStopsError(false);
      })
      .catch(() => {
        if (!isMounted.current) return;
        setStopsError(true);
      });

    return () => {
      isMounted.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      cancelAnimation(greetOpacity);
      cancelAnimation(greetY);
      cancelAnimation(cardOpacity);
      cancelAnimation(cardY);
    };
  }, [cardOpacity, cardY, greetOpacity, greetY]);

  const greetStyle = useAnimatedStyle(() => ({
    opacity: greetOpacity.value,
    transform: [{ translateY: greetY.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }],
  }));

  /** Pre-compute lowercase names so we don't call toLowerCase() 1000x per keystroke */
  const stopsIndex = useMemo(
    () => stops.map((s) => ({ ...s, _lower: s.stop_name.toLowerCase() })),
    [stops]
  );

  const sourceSugg = useMemo(() => {
    if (!sourceInput || sourceStop) return [];
    const q = sourceInput.toLowerCase();
    return stopsIndex.filter((s) => s._lower.includes(q)).slice(0, 8);
  }, [sourceInput, sourceStop, stopsIndex]);

  const destSugg = useMemo(() => {
    if (!destInput || destStop) return [];
    const q = destInput.toLowerCase();
    return stopsIndex.filter((s) => s._lower.includes(q)).slice(0, 8);
  }, [destInput, destStop, stopsIndex]);

  const runSearch = useCallback(async (src: Stop, dst: Stop, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const res = await getApi().get(API_ENDPOINTS.searchBuses as string, {
        params: { source_stop_id: src.id, destination_stop_id: dst.id },
      });
      const found = normalizeRoutes(res.data);
      if (isMounted.current) setRoutes(found);
      if (!silent && !found.length) {
        setError("No active buses found for this direction.");
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const isNoResults = status === 404 || status === 204;

      if (isMounted.current) {
        setRoutes([]);
        if (!silent) {
          setError(
            isNoResults ? "No active buses found for this direction." : "Search failed. Please try again."
          );
        }
      }
    } finally {
      if (!silent && isMounted.current) setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    if (!sourceStop || !destStop) {
      setError("Select both source and destination stops.");
      return;
    }
    if (sourceStop.id === destStop.id) {
      setError("Source and destination must differ.");
      return;
    }

    Keyboard.dismiss();
    setShowSourceDrop(false);
    setShowDestDrop(false);
    setHasSearched(true);
    allowAutoRef.current = true;
    setLastSearch({ source: sourceStop, dest: destStop });
    runSearch(sourceStop, destStop, false);
  }, [destStop, runSearch, sourceStop]);

  useEffect(() => {
    if (!lastSearch) return undefined;
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      if (allowAutoRef.current) {
        runSearch(lastSearch.source, lastSearch.dest, true);
      }
    }, SEARCH_REFRESH_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [lastSearch, runSearch]);

  const handleSwap = useCallback(() => {
    setSourceInput(destInput);
    setDestInput(sourceInput);
    setSourceStop(destStop);
    setDestStop(sourceStop);
  }, [destInput, destStop, sourceInput, sourceStop]);

  const sortedRoutes = useMemo(() => {
    if (sortMode === "all") return routes;
    return routes.map((routeGroup) => ({
      ...routeGroup,
      buses: [...routeGroup.buses].sort((a, b) => {
        const aStops = Number.isFinite(Number(a.stops_away))
          ? Number(a.stops_away)
          : Infinity;
        const bStops = Number.isFinite(Number(b.stops_away))
          ? Number(b.stops_away)
          : Infinity;
        return aStops - bStops;
      }),
    }));
  }, [routes, sortMode]);

  const totalBuses = sortedRoutes.reduce(
    (acc, routeGroup) => acc + routeGroup.buses.length,
    0
  );
  const firstName = getFirstName(user?.name || user?.email);
  const greeting = firstName ? `${getGreeting()}, ${firstName}` : getGreeting();
  const initials = getInitials(user?.name || user?.email);
  // cols/rows removed — now computed inside BackgroundGrid

  const closeError = useCallback(() => setError(""), []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.bgBottom} />
      <View style={styles.bgMid} />
      <View style={styles.bgTop} />
      <View style={styles.blobTL} />
      <View style={styles.blobBR} />

      <BackgroundGrid />

      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.navbar}>
          <BrandHeader
            right={
              <View style={styles.navRight}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <TouchableOpacity onPress={logout} style={styles.signOutBtn} activeOpacity={0.8}>
                  <Text style={styles.signOutText}>Sign out</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                if (lastSearch) {
                  await runSearch(lastSearch.source, lastSearch.dest, false);
                }
                setRefreshing(false);
              }}
              tintColor="rgba(255,255,255,0.6)"
            />
          }
        >
          <Animated.Text style={[styles.greeting, greetStyle]}>
            {greeting}
          </Animated.Text>

          <Animated.View style={[styles.searchCard, cardStyle]}>
            <View style={styles.inputsRow}>
              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>FROM</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    placeholder="Search source stop"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    value={sourceInput}
                    onChangeText={(text) => {
                      setSourceInput(text);
                      setSourceStop(null);
                      setShowSourceDrop(true);
                    }}
                    onFocus={() => setShowSourceDrop(true)}
                  />
                  {showSourceDrop && (
                    <>
                      <TouchableWithoutFeedback onPress={() => setShowSourceDrop(false)}>
                        <View style={styles.dropdownBackdrop} />
                      </TouchableWithoutFeedback>
                      <Dropdown
                        items={sourceSugg}
                        onSelect={(stop) => {
                          setSourceStop(stop);
                          setSourceInput(stop.stop_name);
                          setShowSourceDrop(false);
                        }}
                      />
                    </>
                  )}
                </View>
              </View>

              <TouchableOpacity onPress={handleSwap} style={styles.swapBtn} activeOpacity={0.7}>
                <SwapIcon />
              </TouchableOpacity>

              <View style={styles.inputCol}>
                <Text style={styles.inputLabel}>TO</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    placeholder="Search destination"
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    value={destInput}
                    onChangeText={(text) => {
                      setDestInput(text);
                      setDestStop(null);
                      setShowDestDrop(true);
                    }}
                    onFocus={() => setShowDestDrop(true)}
                  />
                  {showDestDrop && (
                    <>
                      <TouchableWithoutFeedback onPress={() => setShowDestDrop(false)}>
                        <View style={styles.dropdownBackdrop} />
                      </TouchableWithoutFeedback>
                      <Dropdown
                        items={destSugg}
                        onSelect={(stop) => {
                          setDestStop(stop);
                          setDestInput(stop.stop_name);
                          setShowDestDrop(false);
                        }}
                      />
                    </>
                  )}
                </View>
              </View>
            </View>

            {stopsError && (
              <Text style={styles.stopsErrorHint}>Could not load stops — pull to refresh</Text>
            )}

            <View style={styles.searchBtnWrap}>
              <TouchableOpacity
                onPress={handleSearch}
                disabled={loading}
                activeOpacity={0.88}
                style={[styles.searchBtn, loading && styles.searchBtnDisabled]}
              >
                <SearchIcon />
                <Text style={styles.searchBtnText}>
                  {loading ? "Searching..." : "Search Buses"}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <ErrorBanner message={error} onClose={closeError} />

          {loading && <SkeletonCard />}

          {!loading && routes.length > 0 && (
            <ResultsSection
              routes={routes}
              sortedRoutes={sortedRoutes}
              totalBuses={totalBuses}
              sortMode={sortMode}
              setSortMode={setSortMode}
              navigation={navigation}
            />
          )}

          {!loading && routes.length === 0 && (
            <EmptyState hasSearched={hasSearched} />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
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
  blobTL: {
    position: "absolute",
    width: W * 0.9,
    height: W * 0.9,
    borderRadius: W * 0.45,
    backgroundColor: "rgba(29,111,164,0.14)",
    top: -W * 0.25,
    left: -W * 0.25,
  },
  blobBR: {
    position: "absolute",
    width: W * 0.8,
    height: W * 0.8,
    borderRadius: W * 0.4,
    backgroundColor: "rgba(15,79,140,0.09)",
    bottom: -W * 0.2,
    right: -W * 0.2,
  },
  safe: {
    flex: 1,
  },
  navbar: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.08)",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(21,101,168,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(21,101,168,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f4f8c",
  },
  signOutBtn: {
    height: 32,
    paddingHorizontal: 14,
    backgroundColor: "rgba(21,101,168,0.08)",
    borderWidth: 1,
    borderColor: "rgba(21,101,168,0.22)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#1565a8",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 72,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 22,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  searchCard: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 20,
  },
  inputsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  inputWrap: {
    position: "relative",
    zIndex: 60,
  },
  input: {
    height: 42,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 9,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#0f172a",
  },
  swapBtn: {
    width: 34,
    height: 42,
    borderRadius: 9,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnWrap: {
    padding: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginTop: 12,
  },
  searchBtn: {
    height: 40,
    backgroundColor: "#1565a8",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  searchBtnDisabled: {
    opacity: 0.6,
  },
  searchBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 8,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaCount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveText: {
    fontSize: 11,
    color: "#166534",
    fontWeight: "700",
  },
  sortRow: {
    flexDirection: "row",
    gap: 5,
  },
  sortBtn: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  sortBtnActive: {
    backgroundColor: "#0f172a",
    borderColor: "transparent",
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  sortBtnTextActive: {
    color: "#ffffff",
  },
  liveAutoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
    backgroundColor: "rgba(16,185,129,0.13)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.22)",
  },
  liveAutoText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(6,95,70,0.9)",
    letterSpacing: 0.4,
  },
  dropdownBackdrop: {
    position: "absolute",
    top: -500,
    left: -500,
    right: -500,
    bottom: -500,
    zIndex: 40,
  },
  stopsErrorHint: {
    fontSize: 12,
    color: "#dc2626",
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 8,
    textAlign: "left",
  },
});

export default UserDashboardScreen;
