import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveBusTracking } from "../../hooks/useLiveBusTracking";
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { AnimatedRegion, Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Line, Path } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { API_ENDPOINTS, BORDER_RADIUS, SPACING } from "../../constants/config";
import { useAuth } from "../../context/AuthContext";
import { getApi } from "../../services/api";
import { LiveDot, BrandHeader } from "../../components";
import {
  joinBusRoom,
  leaveBusRoom,
  onTripCompleted,
  onTripStopUpdate,
} from "../../socket/socket";
import type { RootStackScreenProps } from "../../navigation/types";

const { width: W, height: H } = Dimensions.get("window");
const MAP_PROVIDER = Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

type BusCoordinate = {
  latitude: number;
  longitude: number;
};

const STATUS_CONFIG: Record<
  string,
  { dotColor: string; bg: string; label: string; labelColor: string }
> = {
  departed: {
    dotColor: "#94a3b8",
    bg: "#f1f5f9",
    label: "departed",
    labelColor: "#64748b",
  },
  arrived: {
    dotColor: "#16a34a",
    bg: "#f0fdf4",
    label: "arrived",
    labelColor: "#15803d",
  },
  approaching: {
    dotColor: "#1d4ed8",
    bg: "#eff6ff",
    label: "approaching",
    labelColor: "#1d4ed8",
  },
  pending: {
    dotColor: "#cbd5e1",
    bg: "#f8fafc",
    label: "pending",
    labelColor: "#64748b",
  },
  completed: {
    dotColor: "#16a34a",
    bg: "#f0fdf4",
    label: "completed",
    labelColor: "#15803d",
  },
};

interface TripStop {
  id?: number;
  stop_id?: number;
  name?: string;
  stop_name?: string;
  state?: string;
  status?: string;
  latitude?: number | string;
  longitude?: number | string;
  stop_lat?: number | string;
  stop_lng?: number | string;
  etaMinutes?: number | null;
  eta_minutes?: number | null;
  arrival_time?: string | null;
  scheduled_time?: string | null;
  time?: string | null;
  sequence?: number;
}

interface Timeline {
  trip_id: number;
  bus_id?: number;
  bus_number?: string;
  route_name?: string;
  status?: string;
  trip_status?: string;
  stops: TripStop[];
}

function getStatusConfig(state?: string) {
  return STATUS_CONFIG[String(state || "pending").toLowerCase()] || STATUS_CONFIG.pending;
}

function isValidLatLng(lat: unknown, lng: unknown) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  );
}

function getInitials(name?: string): string {
  if (!name) return "PS";
  const parts = name.split(/[@.\s]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function BusGlyph() {
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

function BackIcon({ color = "#ffffff" }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Path
        d="M10 3L5 8l5 5"
        stroke={color}
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

function PulsingStatusDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.7, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.1, { duration: 900 }),
        withTiming(0.45, { duration: 900 })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [opacity, scale]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.pulseDotWrap}>
      <Animated.View style={[styles.pulseRing, { backgroundColor: color }, ringStyle]} />
      <View style={[styles.timelineDot, { backgroundColor: color }]} />
    </View>
  );
}

function TripMarker() {
  return (
    <View style={styles.busMarker}>
      <BusGlyph />
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#1565a8" />
      <Text style={styles.loadingText}>Loading trip...</Text>
    </View>
  );
}

interface RouteMapProps {
  busCoordinate: { latitude: number; longitude: number } | AnimatedRegion | null;
  busNumber?: string;
  mapRegion: Region | undefined;
}

const RouteMap = React.memo(function RouteMap({ busCoordinate, busNumber, mapRegion }: RouteMapProps) {
  if (!mapRegion) return null;
  return (
    <MapView
      style={styles.map}
      provider={MAP_PROVIDER}
      initialRegion={mapRegion}
      showsCompass
      showsUserLocation={false}
      moveOnMarkerPress={false}
      pitchEnabled={false}
    >
      {busCoordinate && (
        <Marker.Animated coordinate={busCoordinate as any} title="Bus" description={busNumber}>
          <TripMarker />
        </Marker.Animated>
      )}
    </MapView>
  );
});

export function TrackTripScreen({ route, navigation }: RootStackScreenProps<'TrackTrip'>) {
  const tripId = route?.params?.tripId;
  const tripIdRef = useRef(tripId);
  const lastBusRoomRef = useRef<number | null>(null);
  const hasAutocenteredRef = useRef(false);
  const { user, socketConnected } = useAuth();
  const { bottom: safeBottom } = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [mapRegion, setMapRegion] = useState<Region | undefined>(undefined);
  const [apiBusPosition, setApiBusPosition] = useState<BusCoordinate | null>(null);
  const busAnimRef = useRef<AnimatedRegion | null>(null);
  const lastSocketPositionAtRef = useRef<number>(0);

  /** Navigate back safely — pop stack if possible, otherwise navigate to UserTabs */
  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("UserTabs");
    }
  }, [navigation]);

  /** Android hardware back button */
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        goBack();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [goBack])
  );

  const fetchTimeline = useCallback(async () => {
    if (!tripId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await getApi().get(API_ENDPOINTS.tripTimeline(tripId));
      const data = res.data;
      setTimeline(data);

      const busId = Number(data?.bus_id);
      if (Number.isFinite(busId) && busId > 0) {
        joinBusRoom(busId);
        lastBusRoomRef.current = busId;
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load trip.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  // Socket initialization is now centralized in AuthContext

  useEffect(() => {
    fetchTimeline();

    return () => {
      if (lastBusRoomRef.current) {
        leaveBusRoom(lastBusRoomRef.current);
        lastBusRoomRef.current = null;
      }
    };
  }, [fetchTimeline]);

  useEffect(() => {
    const unsub = onTripStopUpdate((payload: any) => {
      if (!payload || Number(payload.trip_id) !== Number(tripIdRef.current)) return;

      if (payload.status === "completed" || payload.trip_status === "completed") {
        setTimeline((prev) =>
          prev ? { ...prev, status: "completed", trip_status: "completed" } : prev
        );
        return;
      }

      setTimeline((prev) => {
        if (!prev) return prev;
        if (Array.isArray(payload.stops)) {
          return {
            ...prev,
            stops: payload.stops,
            status: payload.status || prev.status,
            trip_status: payload.trip_status || payload.status || prev.trip_status,
          };
        }
        if (payload.stopId != null && payload.toState != null) {
          const updatedStops = prev.stops.map((stop) => {
            const id = stop.stop_id ?? stop.id;
            if (Number(id) === Number(payload.stopId)) {
              return { ...stop, state: payload.toState, status: payload.toState };
            }
            return stop;
          });
          return { ...prev, stops: updatedStops };
        }
        return prev;
      });
    });

    return unsub;
  }, [socketConnected]);

  useEffect(() => {
    const unsub = onTripCompleted((payload: any) => {
      if (!payload || Number(payload.trip_id) !== Number(tripIdRef.current)) return;
      setTimeline((prev) =>
        prev ? { ...prev, status: "completed", trip_status: "completed" } : prev
      );
    });

    return unsub;
  }, [socketConnected]);

  // --- Live bus tracking via hook (smooth animated positions) ---
  const busId = timeline?.bus_id ? Number(timeline.bus_id) : undefined;
  const isCompleted =
    timeline?.status === "completed" || timeline?.trip_status === "completed";

  const { smoothedPositions } = useLiveBusTracking({
    busIds: busId ? [busId] : [],
    enabled: !!busId && !isCompleted,
    animationDurationMs: 2800,
  });

  const busPosition = useMemo(() => {
    if (!busId || !smoothedPositions[busId]) return null;
    const [lat, lng] = smoothedPositions[busId];
    return { latitude: lat, longitude: lng };
  }, [busId, smoothedPositions]);

  const displayBusPosition = busPosition ?? apiBusPosition;

  useEffect(() => {
    setApiBusPosition(null);
    busAnimRef.current = null;
    lastSocketPositionAtRef.current = 0;
    hasAutocenteredRef.current = false;
  }, [busId]);

  useEffect(() => {
    if (!busPosition) return;
    lastSocketPositionAtRef.current = Date.now();
  }, [busPosition?.latitude, busPosition?.longitude]);

  const fetchLatestBusLocation = useCallback(async (targetBusId: number) => {
    const endpoint = `${API_ENDPOINTS.locations}/bus/${targetBusId}`;

    try {
      const res = await getApi().get(endpoint);
      const latitude = Number(res.data?.latitude);
      const longitude = Number(res.data?.longitude);

      if (!isValidLatLng(latitude, longitude)) {
        if (__DEV__) {
          console.warn("[TrackTrip] invalid bus location payload", {
            busId: targetBusId,
            latitude: res.data?.latitude,
            longitude: res.data?.longitude,
          });
        }
        return null;
      }

      const next = { latitude, longitude };
      setApiBusPosition((prev) => {
        if (prev && prev.latitude === next.latitude && prev.longitude === next.longitude) {
          return prev;
        }
        return next;
      });

      return next;
    } catch (fetchError: any) {
      if (__DEV__) {
        console.warn("[TrackTrip] fallback bus location fetch failed", {
          busId: targetBusId,
          message: fetchError?.response?.data?.message || fetchError?.message || "Unknown error",
        });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (!busId || isCompleted) return;
    fetchLatestBusLocation(busId);
  }, [busId, isCompleted, fetchLatestBusLocation]);

  useEffect(() => {
    if (!busId || isCompleted) return;

    let cancelled = false;
    let inFlight = false;

    const pollLatestLocation = async () => {
      if (cancelled || inFlight) return;

      const socketAgeMs = Date.now() - lastSocketPositionAtRef.current;
      const shouldPoll = !socketConnected || socketAgeMs > 10000;
      if (!shouldPoll) return;

      inFlight = true;
      try {
        await fetchLatestBusLocation(busId);
      } finally {
        inFlight = false;
      }
    };

    const intervalMs = socketConnected ? 8000 : 4000;
    const timer = setInterval(() => {
      void pollLatestLocation();
    }, intervalMs);

    void pollLatestLocation();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [busId, isCompleted, socketConnected, fetchLatestBusLocation]);

  useEffect(() => {
    if (!displayBusPosition) return;
    if (!isValidLatLng(displayBusPosition.latitude, displayBusPosition.longitude)) return;

    if (!busAnimRef.current) {
      busAnimRef.current = new AnimatedRegion({
        latitude: displayBusPosition.latitude,
        longitude: displayBusPosition.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      return;
    }

    busAnimRef.current.timing({
      latitude: displayBusPosition.latitude,
      longitude: displayBusPosition.longitude,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [displayBusPosition?.latitude, displayBusPosition?.longitude]);

  /** Auto-center map once on first valid bus position or stop coords */
  useEffect(() => {
    if (hasAutocenteredRef.current) return;
    const target = displayBusPosition;
    if (!target) return;
    hasAutocenteredRef.current = true;
    setMapRegion({
      latitude: target.latitude,
      longitude: target.longitude,
      latitudeDelta: 0.055,
      longitudeDelta: 0.055,
    });
  }, [displayBusPosition]);

  // Avoid "maximum update depth" loops by not controlling MapView region continuously.

  // isCompleted is declared above alongside useLiveBusTracking
  const initials = getInitials(user?.name || user?.email);
  const statusConfig = getStatusConfig(isCompleted ? "completed" : "approaching");

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.bgBottom} />
        <View style={styles.bgMid} />
        <View style={styles.bgTop} />
        <LoadingState />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.root}>
        <View style={styles.bgBottom} />
        <View style={styles.bgMid} />
        <View style={styles.bgTop} />
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Failed to load trip</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchTimeline}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.errorBackBtn}
            onPress={goBack}
          >
            <Text style={styles.errorBackText}>Back to Search</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
          <View style={styles.navLeft}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.navBackBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <BackIcon />
            </TouchableOpacity>
            <BrandHeader subtitle="Trip tracking" />
          </View>
          <View style={styles.navRight}>
            <View
              style={[
                styles.navStatus,
                { backgroundColor: isCompleted ? "#fffbeb" : "#f0fdf4" },
              ]}
            >
              {!isCompleted && <LiveDot color="#16a34a" />}
              <Text
                style={[
                  styles.navStatusText,
                  { color: isCompleted ? "#b45309" : "#15803d" },
                ]}
              >
                {isCompleted ? "Completed" : "Live"}
              </Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.infoCard}>
            <View style={styles.infoCardAccent} />
            <View style={styles.infoMain}>
              <Text style={styles.infoLabel}>Bus number</Text>
              <Text style={styles.busNumber}>{timeline?.bus_number ?? `Trip ${tripId}`}</Text>
              <Text style={styles.routeName}>
                {timeline?.route_name ?? "Live route tracking"}
              </Text>
            </View>
            <View style={[styles.bigStatusBadge, { backgroundColor: statusConfig.bg }]}>
              {!isCompleted && <LiveDot color={statusConfig.dotColor} />}
              <Text style={[styles.bigStatusText, { color: statusConfig.labelColor }]}>
                {isCompleted ? "Completed" : "Active"}
              </Text>
            </View>
          </View>

          {!socketConnected && !isCompleted && (
            <View style={styles.reconnectingBanner}>
              <ActivityIndicator size="small" color="#1565a8" />
              <Text style={styles.reconnectingText}>Reconnecting to live tracking...</Text>
            </View>
          )}

          <View style={styles.mapCard}>
            <RouteMap
              busCoordinate={busAnimRef.current ?? displayBusPosition}
              busNumber={timeline?.bus_number}
              mapRegion={mapRegion}
            />
            {!displayBusPosition && (
              <View style={styles.mapFloatingBadge}>
                <Text style={styles.mapFloatingLabel}>Waiting for live location</Text>
                <Text style={styles.mapFloatingText}>
                  Bus location will appear once tracking updates are received.
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(safeBottom, 12) }]}>
          <TouchableOpacity
            style={styles.backPill}
            activeOpacity={0.86}
            onPress={goBack}
          >
            <BackIcon />
            <Text style={styles.backPillText}>Back to Search</Text>
          </TouchableOpacity>
        </View>
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
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(21,101,168,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "rgba(21,101,168,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  brandSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navStatus: {
    height: 28,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  navStatusText: {
    fontSize: 11,
    fontWeight: "700",
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
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  infoCard: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    padding: SPACING.section,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    overflow: "hidden",
  },
  infoCardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: "#1565a8",
  },
  infoMain: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  busNumber: {
    fontSize: 25,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.8,
  },
  routeName: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  bigStatusBadge: {
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 10,
  },
  bigStatusText: {
    fontSize: 12,
    fontWeight: "800",
  },
  mapCard: {
    height: H * 0.52,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(255,255,255,0.86)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  map: {
    flex: 1,
  },
  mapFloatingBadge: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.8)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  mapFloatingLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1565a8",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  mapFloatingText: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  busMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1565a8",
    borderWidth: 3,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1565a8",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pulseDotWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 15,
    height: 15,
    borderRadius: 7.5,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(247,250,252,0.82)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.7)",
  },
  backPill: {
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1565a8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#1565a8",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  backPillText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  emptyState: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(21,101,168,0.12)",
    borderStyle: "dashed",
    paddingVertical: 34,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  emptySub: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 6,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    color: "#1565a8",
    fontSize: 14,
    fontWeight: "700",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: "#1565a8",
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  errorBackBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorBackText: {
    color: "#1565a8",
    fontWeight: "800",
    fontSize: 13,
  },
  reconnectingBanner: {
    backgroundColor: "rgba(21,101,168,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  reconnectingText: {
    color: "#1565a8",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    borderRadius: 14,
    padding: 4,
    marginTop: 12,
    zIndex: 10,
  },
  tabBtn: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    backgroundColor: "rgba(21,101,168,0.12)",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
  },
  tabTextActive: {
    color: "#0f4f8c",
  },
});

export default TrackTripScreen;
