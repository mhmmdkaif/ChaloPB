/**
 * DriverDashboardScreen - Full GPS tracking with trip start/stop
 * Business logic mirrors web DriverDashboard.jsx exactly:
 *  - Loads dashboard: /drivers/me/dashboard (bus info + active trip + route stops)
 *  - Start trip: POST /drivers/me/trips/start with initial GPS coords
 *  - Stop trip: POST /drivers/me/trips/stop
 *  - GPS watch: expo-location watchPositionAsync, sends updates to /location/update
 *  - Timer: counts trip duration in real time
 *  - Socket: joins bus room for self-tracking confirmation
 *  - Shows map with bus marker, stop markers, route polyline
 *  - Shows next stop, current stop, route timeline
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getApi } from "../../services/api";
import { BORDER_RADIUS, COLORS, SPACING } from "../../constants/config";
import { useAuth } from "../../context/AuthContext";
import { joinBusRoom } from "../../socket/socket";

const UPDATE_INTERVAL_MS = 3000;
const MIN_DISTANCE_M = 10;

interface BusInfo {
  id: number;
  bus_number: string;
  route_name?: string;
}

interface RouteStop {
  id: number;
  stop_name?: string;
  name?: string;
  latitude?: number | string;
  longitude?: number | string;
  state?: string;
  status?: string;
  sequence?: number;
}

interface ActiveTrip {
  id: number;
  started_at?: string;
  status?: string;
}

function gpsDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getStopState(stop: RouteStop) {
  return String(stop.state ?? stop.status ?? "pending").toLowerCase();
}

function getStopName(stop: RouteStop) {
  return stop.stop_name ?? stop.name ?? "Stop";
}

function isValidLatLng(lat: unknown, lng: unknown) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
}

function getStopPalette(state: string, isCurrent: boolean) {
  if (state === "arrived") {
    return { bg: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.3)", text: "#166534", icon: "#16a34a" };
  }
  if (state === "departed") {
    return { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.18)", text: "#475569", icon: "#94a3b8" };
  }
  if (isCurrent) {
    return { bg: "rgba(21,101,168,0.14)", border: "rgba(21,101,168,0.34)", text: "#0f4f8c", icon: "#1565a8" };
  }
  return { bg: "rgba(255,255,255,0.6)", border: "rgba(191,219,254,0.9)", text: "#334155", icon: "#93c5fd" };
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <View style={[styles.statusBadge, active ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
      <View style={[styles.statusBadgeDot, active ? styles.statusBadgeDotActive : styles.statusBadgeDotInactive]} />
      <Text style={[styles.statusBadgeText, active ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive]}>
        {active ? "Active" : "Inactive"}
      </Text>
    </View>
  );
}

function StopRow({ stop, index, isCurrent }: { stop: RouteStop; index: number; isCurrent: boolean }) {
  const state = getStopState(stop);
  const palette = getStopPalette(state, isCurrent);
  const completed = state === "arrived";

  return (
    <View style={[styles.stopRow, { backgroundColor: palette.bg, borderColor: palette.border }, isCurrent && styles.stopRowCurrent]}>
      <View style={[styles.stopCheck, { borderColor: palette.icon, backgroundColor: completed ? palette.icon : "transparent" }]}>
        {completed ? (
          <MaterialCommunityIcons name="check" size={13} color="#ffffff" />
        ) : isCurrent ? (
          <View style={[styles.stopCheckInner, { backgroundColor: palette.icon }]} />
        ) : (
          <MaterialCommunityIcons name="circle-outline" size={15} color={palette.icon} />
        )}
      </View>
      <View style={styles.stopMain}>
        <View style={styles.stopTitleRow}>
          <Text style={[styles.stopName, isCurrent && styles.stopNameCurrent]} numberOfLines={1}>
            {index + 1}. {getStopName(stop)}
          </Text>
          {isCurrent && (
            <View style={styles.currentPill}>
              <Text style={styles.currentPillText}>Current</Text>
            </View>
          )}
        </View>
        <Text style={[styles.stopStateText, { color: palette.text }]}>
          {state === "arrived" ? "Arrived" : state === "departed" ? "Departed" : isCurrent ? "Current" : "Pending"}
        </Text>
      </View>
      <MaterialCommunityIcons name={completed ? "check-circle" : "chevron-right"} size={18} color={palette.icon} />
    </View>
  );
}

function DashboardBackground() {
  return (
    <View pointerEvents="none" style={styles.backgroundWrap}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFillObject}>
        <Defs>
          <LinearGradient id="dashboardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#061650" />
            <Stop offset="55%" stopColor="#0f4f8c" />
            <Stop offset="100%" stopColor="#1565a8" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#dashboardGrad)" />
        <Circle cx="18" cy="18" r="18" fill="rgba(96,165,250,0.14)" />
        <Circle cx="88" cy="12" r="12" fill="rgba(125,211,252,0.18)" />
        <Circle cx="82" cy="84" r="20" fill="rgba(30,64,175,0.24)" />
      </Svg>
      <View style={styles.backgroundGlowLeft} />
      <View style={styles.backgroundGlowRight} />
    </View>
  );
}

export function DriverDashboardScreen({ navigation }: { navigation: any }) {
  const { user, logout, socketConnected } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busInfo, setBusInfo] = useState<BusInfo | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [tracking, setTracking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [speed, setSpeed] = useState(0);
  const [tripDuration, setTripDuration] = useState(0);

  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const lastSendRef = useRef(0);
  const lastSentLatRef = useRef<number | null>(null);
  const lastSentLngRef = useRef<number | null>(null);
  const tripStartRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const busIdRef = useRef<number | null>(null);

  const showAlert = useCallback((title: string, msg: string) => {
    Alert.alert(title, msg);
  }, []);

  const startTripTimer = useCallback((startedAt: string | number) => {
    const parsed = Number(new Date(startedAt).getTime());
    const safeStart = Number.isFinite(parsed) ? Math.min(Date.now(), parsed) : Date.now();
    tripStartRef.current = safeStart;
    setTripDuration(Math.max(0, Math.floor((Date.now() - safeStart) / 1000)));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!tripStartRef.current) return;
      setTripDuration(Math.max(0, Math.floor((Date.now() - tripStartRef.current) / 1000)));
    }, 1000);
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Socket initialization is now centralized in AuthContext
      const api = getApi();
      const res = await api.get("/drivers/me/dashboard");
      const bus = res.data?.bus || null;
      const trip = res.data?.active_trip || null;
      const stops = Array.isArray(res.data?.route_stops) ? res.data.route_stops : [];

      setBusInfo(bus);
      setRouteStops(stops);
      busIdRef.current = bus?.id ?? null;

      if (trip?.id) {
        setActiveTrip(trip);
        setTracking(true);
        if (trip.started_at) startTripTimer(trip.started_at);
        if (bus?.id) joinBusRoom(Number(bus.id));
      } else {
        setActiveTrip(null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [startTripTimer, user?.token]);

  useEffect(() => {
    fetchDashboard();
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchDashboard]);

  // Socket initialization is now centralized in AuthContext

  const sendLocationUpdate = useCallback(async (loc: Location.LocationObject) => {
    const now = Date.now();
    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    const spd = (loc.coords.speed ?? 0) * 3.6;
    const acc = loc.coords.accuracy ?? null;

    setLocation({ latitude: lat, longitude: lng });
    setSpeed(Math.round(spd));

    if (now - lastSendRef.current < UPDATE_INTERVAL_MS) return;
    if (lastSentLatRef.current !== null && lastSentLngRef.current !== null) {
      const moved = gpsDistanceMeters(lastSentLatRef.current, lastSentLngRef.current, lat, lng);
      const timeSinceLast = now - lastSendRef.current;
      if (moved < MIN_DISTANCE_M && timeSinceLast < 15000) return;
    }

    lastSendRef.current = now;
    lastSentLatRef.current = lat;
    lastSentLngRef.current = lng;

    try {
      const api = getApi();
      await api.post("/location/update", {
        bus_id: busIdRef.current,
        latitude: lat,
        longitude: lng,
        speed: spd,
        accuracy: acc,
        device_timestamp: new Date().toISOString(),
      });
    } catch {
      // best effort
    }
  }, []);

  useEffect(() => {
    if (!tracking) return;

    let active = true;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
      (loc) => {
        if (active) sendLocationUpdate(loc);
      }
    )
      .then((sub) => {
        if (active) locationSubRef.current = sub;
        else sub.remove();
      })
      .catch(console.error);

    return () => {
      active = false;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, [tracking, sendLocationUpdate]);

  const startTrip = useCallback(async () => {
    if (!busIdRef.current) {
      showAlert("No Bus Assigned", "You don't have a bus assigned.");
      return;
    }
    if (tracking || starting) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location Permission", "ChaloPB needs location access to share your position with passengers.");
      return;
    }

    setStarting(true);
    try {
      const firstLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const api = getApi();
      const res = await api.post("/drivers/me/trips/start", {
        latitude: firstLoc.coords.latitude,
        longitude: firstLoc.coords.longitude,
      });
      const trip = res.data?.trip;
      if (trip?.id) {
        setActiveTrip(trip);
        setTracking(true);
        startTripTimer(trip.started_at || Date.now());
        if (busIdRef.current) joinBusRoom(busIdRef.current);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Unable to start trip";
      showAlert("Start Failed", msg);
    } finally {
      setStarting(false);
    }
  }, [showAlert, starting, startTripTimer, tracking]);

  const stopTrip = useCallback(async () => {
    if (!activeTrip?.id) return;
    Alert.alert("Stop Trip", "Are you sure you want to end this trip?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop Trip",
        style: "destructive",
        onPress: async () => {
          setStopping(true);
          try {
            const api = getApi();
            await api.post("/drivers/me/trips/stop");
            locationSubRef.current?.remove();
            locationSubRef.current = null;
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            tripStartRef.current = null;
            lastSendRef.current = 0;
            lastSentLatRef.current = null;
            lastSentLngRef.current = null;
            setTracking(false);
            setActiveTrip(null);
            setTripDuration(0);
            setSpeed(0);
          } catch (err: any) {
            const msg = err?.response?.data?.message || "Unable to stop trip";
            showAlert("Error", msg);
          } finally {
            setStopping(false);
          }
        },
      },
    ]);
  }, [activeTrip, showAlert]);

  const currentStopIndex = useMemo(() => {
    const approaching = routeStops.findIndex((stop) => getStopState(stop) === "approaching");
    return approaching !== -1 ? approaching : routeStops.findIndex((stop) => getStopState(stop) === "pending");
  }, [routeStops]);

  const currentStop = currentStopIndex >= 0 ? routeStops[currentStopIndex] : null;

  const arrivedCount = useMemo(
    () => routeStops.filter((stop) => getStopState(stop) === "arrived" || getStopState(stop) === "departed").length,
    [routeStops]
  );

  const progressPct = routeStops.length > 0 ? Math.round((arrivedCount / routeStops.length) * 100) : 0;

  const markCurrentStopArrived = useCallback(() => {
    if (!routeStops.length) return;
    const stopIndex = routeStops.findIndex((stop) => {
      const state = getStopState(stop);
      return state === "approaching" || state === "pending";
    });

    if (stopIndex < 0) {
      Alert.alert("No pending stop", "All route stops have already been completed.");
      return;
    }

    setRouteStops((prev) => prev.map((stop, index) => {
      if (index === stopIndex) return { ...stop, state: "arrived", status: "arrived" };
      if (index === stopIndex + 1 && getStopState(stop) === "pending") return { ...stop, state: "approaching", status: "approaching" };
      return stop;
    }));

    Alert.alert("Stop updated", `${getStopName(routeStops[stopIndex])} marked as arrived.`);
  }, [routeStops]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#061650" />
        <DashboardBackground />
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#061650" />
      <DashboardBackground />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandCol}>
            <Text style={styles.headerTitle}>ChaloPB</Text>
            <Text style={styles.headerSub}>Driver Dashboard</Text>
          </View>
          <View style={styles.driverCol}>
            <Text style={styles.driverName} numberOfLines={1}>{user?.name || "Driver"}</Text>
            <Text style={styles.driverRole}>Driver</Text>
          </View>
        </View>

        {!loading && error && !busInfo && (
          <View style={styles.errorFullScreen}>
            <View style={styles.errorIcon}>
              <MaterialCommunityIcons name="alert-circle" size={48} color="#ef4444" />
            </View>
            <Text style={styles.errorTitle}>{error}</Text>
            <Text style={styles.errorDescription}>Please try again or contact support if the issue persists.</Text>
            <TouchableOpacity style={styles.errorRetryBtn} onPress={fetchDashboard} activeOpacity={0.85}>
              <Text style={styles.errorRetryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && !busInfo && (
          <View style={styles.surfaceCard}>
            <View style={styles.emptyIconWrap}>
              <MaterialCommunityIcons name="bus" size={34} color="#ffffff" />
            </View>
            <Text style={styles.noBusTitle}>No Bus Assigned</Text>
            <Text style={styles.noBusSub}>Contact your admin to get a bus assigned.</Text>
            <TouchableOpacity style={[styles.primaryAction, styles.primaryActionCompact]} onPress={fetchDashboard} activeOpacity={0.85}>
              <Text style={styles.primaryActionText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {busInfo && (
          <>
            <View style={styles.surfaceCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroTopCopy}>
                  <Text style={styles.heroLabel}>Current Trip Status</Text>
                  <Text style={styles.heroValue}>{tracking ? "In Transit" : "Ready for Trip"}</Text>
                </View>
                <StatusBadge active={tracking} />
              </View>

              <View style={styles.routeBlock}>
                <Text style={styles.routeLabel}>Route Name</Text>
                <Text style={styles.routeName}>{busInfo.route_name ?? "No route assigned"}</Text>
              </View>

              <View style={styles.heroStats}>
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatLabel}>Bus</Text>
                  <Text style={styles.heroStatValue}>{busInfo.bus_number}</Text>
                </View>
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatLabel}>Current Stop</Text>
                  <Text style={styles.heroStatValue}>{currentStop ? getStopName(currentStop) : "—"}</Text>
                </View>
                <View style={styles.heroStatChip}>
                  <Text style={styles.heroStatLabel}>Progress</Text>
                  <Text style={styles.heroStatValue}>{progressPct}%</Text>
                </View>
              </View>

              {tracking && (
                <View style={styles.liveStrip}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live tracking enabled</Text>
                  <Text style={styles.liveMeta}>{formatDuration(tripDuration)} · {speed} km/h</Text>
                </View>
              )}

              {tracking && !socketConnected && (
                <View style={styles.reconnectingBanner}>
                  <ActivityIndicator size="small" color="#1565a8" />
                  <Text style={styles.reconnectingText}>Reconnecting to live tracking...</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryAction, tracking ? styles.endTripAction : styles.startTripAction, (starting || stopping) && styles.actionDisabled]}
              onPress={tracking ? stopTrip : startTrip}
              disabled={starting || stopping}
              activeOpacity={0.9}
            >
              {starting || stopping ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <MaterialCommunityIcons name={tracking ? "stop-circle-outline" : "play-circle-outline"} size={22} color="#ffffff" />
                  <Text style={styles.primaryActionText}>{tracking ? "End Trip" : "Start Trip"}</Text>
                </>
              )}
            </TouchableOpacity>

            {tracking && currentStop && (
              <TouchableOpacity style={styles.arrivedAction} onPress={markCurrentStopArrived} activeOpacity={0.9}>
                <MaterialCommunityIcons name="map-marker-check-outline" size={20} color="#1565a8" />
                <Text style={styles.arrivedActionText}>Mark Stop as Arrived</Text>
              </TouchableOpacity>
            )}

            {tracking && routeStops.length > 0 && (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Route Progress</Text>
                  <Text style={styles.progressPct}>{progressPct}%</Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={styles.progressSub}>{arrivedCount} of {routeStops.length} stops completed</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
                <TouchableOpacity onPress={() => setError(null)}>
                  <Text style={styles.errorDismiss}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}

            {routeStops.length > 0 && (
              <View style={styles.surfaceCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Stops</Text>
                  <Text style={styles.sectionMeta}>{currentStop ? `Current: ${getStopName(currentStop)}` : "No current stop"}</Text>
                </View>
                <View style={styles.stopList}>
                  {routeStops.map((stop, index) => (
                    <StopRow key={String(stop.id ?? index)} stop={stop} index={index} isCurrent={currentStopIndex === index || (tracking && getStopState(stop) === "approaching")} />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.footerActions}>
              <TouchableOpacity style={styles.footerGhostBtn} onPress={() => navigation.navigate("DriverHistory")} activeOpacity={0.85}>
                <Text style={styles.footerGhostText}>View History</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerGhostBtn} onPress={logout} activeOpacity={0.85}>
                <Text style={styles.footerGhostText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#061650" },
  backgroundWrap: { ...StyleSheet.absoluteFillObject },
  backgroundGlowLeft: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(96,165,250,0.16)",
    top: -80,
    left: -90,
  },
  backgroundGlowRight: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(125,211,252,0.11)",
    bottom: 110,
    right: -70,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: SPACING.xl },
  loadingText: { marginTop: SPACING.md, color: "#ffffff", fontSize: 14, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: SPACING.lg },
  brandCol: { flex: 1, paddingRight: SPACING.md },
  driverCol: { alignItems: "flex-end", maxWidth: "60%" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#ffffff", letterSpacing: 0.2 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 2, fontWeight: "600" },
  driverName: { fontSize: 16, fontWeight: "800", color: "#ffffff", textAlign: "right" },
  driverRole: { fontSize: 11, color: "rgba(255,255,255,0.72)", marginTop: 2, textAlign: "right", textTransform: "uppercase", letterSpacing: 0.7 },
  surfaceCard: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
    marginBottom: SPACING.md,
  },
  emptyIconWrap: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#1565a8", alignItems: "center", justifyContent: "center", marginBottom: SPACING.md },
  noBusTitle: { fontSize: 18, fontWeight: "800", color: COLORS.gray900, marginBottom: 4, textAlign: "center" },
  noBusSub: { fontSize: 13, color: COLORS.gray600, textAlign: "center", marginBottom: SPACING.lg, lineHeight: 19 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroTopCopy: { flex: 1, paddingRight: SPACING.md },
  heroLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: COLORS.gray500, fontWeight: "700" },
  heroValue: { fontSize: 22, fontWeight: "900", color: COLORS.gray900, marginTop: 4 },
  routeBlock: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: "rgba(15,79,140,0.12)" },
  routeLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: COLORS.gray500, fontWeight: "700", marginBottom: 3 },
  routeName: { fontSize: 18, fontWeight: "800", color: COLORS.primaryDark },
  heroStats: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md, flexWrap: "wrap" },
  heroStatChip: { flexGrow: 1, flexBasis: "31%", minWidth: 88, backgroundColor: "rgba(21,101,168,0.08)", borderRadius: BORDER_RADIUS.lg, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(21,101,168,0.12)" },
  heroStatLabel: { fontSize: 11, color: COLORS.gray500, fontWeight: "700" },
  heroStatValue: { fontSize: 13, color: COLORS.gray900, fontWeight: "800", marginTop: 4 },
  liveStrip: { marginTop: SPACING.md, backgroundColor: "rgba(21,101,168,0.08)", borderRadius: BORDER_RADIUS.lg, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#16a34a", marginRight: 8 },
  liveText: { color: COLORS.primaryDark, fontSize: 12, fontWeight: "800", marginRight: 8 },
  liveMeta: { color: COLORS.gray600, fontSize: 12, fontWeight: "600" },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 6 },
  statusBadgeActive: { backgroundColor: "rgba(34,197,94,0.14)" },
  statusBadgeInactive: { backgroundColor: "rgba(148,163,184,0.14)" },
  statusBadgeDot: { width: 7, height: 7, borderRadius: 999, marginRight: 6 },
  statusBadgeDotActive: { backgroundColor: "#16a34a" },
  statusBadgeDotInactive: { backgroundColor: "#94a3b8" },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },
  statusBadgeTextActive: { color: "#166534" },
  statusBadgeTextInactive: { color: "#475569" },
  primaryAction: { minHeight: 54, borderRadius: BORDER_RADIUS.xl, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3 },
  primaryActionCompact: { width: "100%" },
  startTripAction: { backgroundColor: "#1565a8" },
  endTripAction: { backgroundColor: "#c24141" },
  primaryActionText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  actionDisabled: { opacity: 0.72 },
  arrivedAction: { minHeight: 52, borderRadius: BORDER_RADIUS.xl, borderWidth: 1.5, borderColor: "rgba(21,101,168,0.25)", backgroundColor: "rgba(21,101,168,0.1)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  arrivedActionText: { color: "#1565a8", fontWeight: "900", fontSize: 15 },
  progressCard: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: "rgba(191,219,254,0.55)", marginBottom: SPACING.md },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: SPACING.sm },
  progressLabel: { fontSize: 12, fontWeight: "800", color: COLORS.gray600, textTransform: "uppercase", letterSpacing: 0.4 },
  progressPct: { fontSize: 12, fontWeight: "900", color: "#1565a8" },
  progressBar: { height: 7, backgroundColor: COLORS.gray200, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 7, backgroundColor: "#1565a8", borderRadius: 999 },
  progressSub: { fontSize: 11, color: COLORS.gray500, marginTop: 8, fontWeight: "600" },
  errorBanner: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.24)", borderWidth: 1, borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md },
  errorText: { color: "#991b1b", fontWeight: "700", flex: 1, paddingRight: SPACING.sm },
  errorDismiss: { color: "#b91c1c", fontWeight: "900", fontSize: 12 },
  sectionHeader: { marginBottom: SPACING.md },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: COLORS.gray900 },
  sectionMeta: { fontSize: 12, color: COLORS.gray500, marginTop: 4, fontWeight: "600" },
  stopList: { gap: SPACING.sm },
  stopRow: { minHeight: 64, borderRadius: BORDER_RADIUS.xl, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, flexDirection: "row", alignItems: "center" },
  stopRowCurrent: { shadowColor: "#1565a8", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 2 },
  stopCheck: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.6, alignItems: "center", justifyContent: "center", marginRight: SPACING.md },
  stopCheckInner: { width: 11, height: 11, borderRadius: 6 },
  stopMain: { flex: 1, paddingRight: SPACING.sm },
  stopTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stopName: { flex: 1, fontSize: 15, fontWeight: "800", color: COLORS.gray900, paddingRight: SPACING.sm },
  stopNameCurrent: { color: "#0f4f8c" },
  stopStateText: { marginTop: 4, fontSize: 12, fontWeight: "700" },
  currentPill: { backgroundColor: "rgba(21,101,168,0.14)", borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  currentPillText: { color: "#0f4f8c", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  footerActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.xl },
  footerGhostBtn: { flex: 1, minHeight: 46, borderRadius: BORDER_RADIUS.lg, backgroundColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  footerGhostText: { color: "#ffffff", fontWeight: "800", fontSize: 13 },
  errorFullScreen: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.md, alignItems: "center", justifyContent: "center", minHeight: 340 },
  errorIcon: { marginBottom: SPACING.lg },
  errorTitle: { fontSize: 20, fontWeight: "900", color: COLORS.gray900, marginBottom: SPACING.sm, textAlign: "center" },
  errorDescription: { fontSize: 14, color: COLORS.gray600, textAlign: "center", marginBottom: SPACING.lg, lineHeight: 21, maxWidth: 280 },
  errorRetryBtn: { minHeight: 50, paddingHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.lg, backgroundColor: "#1565a8", alignItems: "center", justifyContent: "center" },
  errorRetryText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  reconnectingBanner: { marginTop: SPACING.md, backgroundColor: "rgba(21,101,168,0.08)", borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, flexDirection: "row", alignItems: "center", gap: SPACING.md },
  reconnectingText: { color: "#1565a8", fontSize: 13, fontWeight: "700", flex: 1 },
});

