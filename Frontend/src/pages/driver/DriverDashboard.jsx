import { useState, useRef, useEffect, useContext, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { AuthContext } from "../../context/AuthContext";
import { ToastContext } from "../../context/ToastContext";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { LogOut } from "lucide-react";
import L from "leaflet";
import { ensureDefaultLeafletIcons } from "../../utils/leafletIcons";
import { toLeafletPolylinePositions } from "../../utils/mapGeometry";
import useLiveBusTracking from "../../hooks/useLiveBusTracking";

ensureDefaultLeafletIcons();

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const SOCKET_URL       = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const UPDATE_INTERVAL  = 3000;

// Timeline geometry — mirrors TrackTripPage exactly
const STOP_SPACING_PX      = 74;
const PADDING_TOP_PX       = 20;
const NODE_CENTER_OFFSET_Y = 18;
const BUS_SIZE_PX          = 26;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function stopCenterY(idx) {
  return PADDING_TOP_PX + idx * STOP_SPACING_PX + NODE_CENTER_OFFSET_Y;
}

function gpsDistanceMeters(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeBusPos(routeStops, currentGpsPos) {
  if (!routeStops || routeStops.length < 2 || !currentGpsPos) return 0;
  const [lat, lng] = currentGpsPos;

  const segDistances = [];
  for (let i = 0; i < routeStops.length - 1; i++) {
    const a = routeStops[i];
    const b = routeStops[i + 1];
    segDistances.push(
      gpsDistanceMeters(
        Number(a.latitude), Number(a.longitude),
        Number(b.latitude), Number(b.longitude)
      )
    );
  }
  const totalDist = segDistances.reduce((s, d) => s + d, 0);
  if (totalDist === 0) return 0;

  let bestSeg = 0, bestFrac = 0, bestDist = Infinity;
  segDistances.forEach((_, i) => {
    const aLat = Number(routeStops[i].latitude);
    const aLng = Number(routeStops[i].longitude);
    const bLat = Number(routeStops[i + 1].latitude);
    const bLng = Number(routeStops[i + 1].longitude);
    const dx   = bLat - aLat, dy = bLng - aLng;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((lat - aLat) * dx + (lng - aLng) * dy) / lenSq;
    t = clamp(t, 0, 1);
    const d = gpsDistanceMeters(lat, lng, aLat + t * dx, aLng + t * dy);
    if (d < bestDist) { bestDist = d; bestSeg = i; bestFrac = t; }
  });

  const distBefore = segDistances.slice(0, bestSeg).reduce((s, d) => s + d, 0);
  return clamp(((distBefore + bestFrac * segDistances[bestSeg]) / totalDist) * 100, 0, 100);
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function geolocationErrorMessage(err) {
  const code = Number(err?.code);
  if (code === 1) return "Location permission denied. Please enable GPS to start the trip.";
  if (code === 2) return "Location unavailable. Try moving to an open area and try again.";
  if (code === 3) return "Location request timed out. Please try again.";
  return "Unable to get your location. Please try again.";
}

function getCurrentPositionAsync(options) {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation?.getCurrentPosition) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function ensureGeolocationPermission() {
  if (!navigator?.permissions?.query) return { allowed: true, state: "unknown" };
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state === "denied") return { allowed: false, state: "denied" };
    return { allowed: true, state: status.state };
  } catch {
    return { allowed: true, state: "unknown" };
  }
}

// ─────────────────────────────────────────────
// Map helpers
// ─────────────────────────────────────────────
const driverIcon = L.divIcon({
  html: `<div style="background:#1d4ed8;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(29,78,216,0.4);">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round">
      <rect x="3" y="8" width="18" height="11" rx="2"/>
      <path d="M7 8V6a2 2 0 014 0v2M13 8V6a2 2 0 014 0v2"/>
      <circle cx="7.5" cy="17" r="1"/><circle cx="16.5" cy="17" r="1"/>
    </svg>
  </div>`,
  iconSize: [36, 36], iconAnchor: [18, 18], className: "",
});

const makeStopIcon = (reached) => L.divIcon({
  html: `<div style="width:12px;height:12px;border-radius:50%;background:${reached ? "#1d4ed8" : "#fff"};border:2.5px solid #1d4ed8;box-shadow:0 1px 4px rgba(0,0,0,0.15)"></div>`,
  iconSize: [12, 12], iconAnchor: [6, 6], className: "",
});

const STOP_ICON_REACHED = makeStopIcon(true);
const STOP_ICON_PENDING = makeStopIcon(false);

function MapFollow({ position }) {
  const map    = useMap();
  const firstRef = useRef(true);
  useEffect(() => {
    if (!position) return;
    if (firstRef.current) {
      firstRef.current = false;
      map.setView(position, map.getZoom(), { animate: false });
      return;
    }
    const center = map.getCenter();
    if (map.distance([center.lat, center.lng], position) < 8) return;
    map.panTo(position, { animate: true, duration: 0.35 });
  }, [map, position]);
  return null;
}

// ─────────────────────────────────────────────
// StopBadge
// ─────────────────────────────────────────────
function StopBadge({ variant, children }) {
  const styles = {
    origin: { background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" },
    final:  { background: "#1e3a8a", color: "#fff" },
    done:   { background: "#dbeafe", color: "#1e40af" },
    next:   { background: "#1d4ed8", color: "#fff" },
  };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
      textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
      ...styles[variant],
    }}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────
// DriverTimeline component
// ─────────────────────────────────────────────
function DriverTimeline({ routeStops = [], reachedStopIds = [], nextStop = null, busPos = 0, tracking = false }) {
  const scrollRef = useRef(null);
  const n = routeStops.length;

  const segLen  = n > 1 ? 100 / (n - 1) : 100;
  const rawSeg  = busPos / segLen;
  const segIdx  = clamp(Math.floor(rawSeg), 0, Math.max(0, n - 2));
  const segProg = clamp(rawSeg - segIdx, 0, 1);
  const reached = segIdx + (segProg >= 0.97 ? 1 : 0);

  const firstY = stopCenterY(0);
  const lastY  = stopCenterY(Math.max(0, n - 1));
  const trackH = lastY - firstY;
  const totalH = PADDING_TOP_PX + (n - 1) * STOP_SPACING_PX + NODE_CENTER_OFFSET_Y + 40;

  const by = useMemo(() => {
    if (!tracking || n < 2) return firstY;
    const fromY = stopCenterY(segIdx);
    const toY   = stopCenterY(clamp(segIdx + 1, 0, n - 1));
    return fromY + (toY - fromY) * segProg;
  }, [tracking, n, segIdx, segProg, firstY]);

  const fillH = tracking ? Math.max(0, by - firstY) : 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !tracking) return;
    el.scrollTo({ top: Math.max(0, by - el.clientHeight / 2), behavior: "smooth" });
  }, [by, tracking]);

  if (n === 0) return null;

  return (
    <div ref={scrollRef} style={{ position: "relative", overflowY: "auto", maxHeight: 460, borderRadius: 12, border: "1px solid #bfdbfe", background: "#fff" }}>
      <div style={{ position: "relative", minHeight: totalH }}>

        {/* Track background */}
        <div aria-hidden="true" style={{ position: "absolute", left: 32, top: firstY, width: 5, height: trackH, background: "#dbeafe", borderRadius: 3, transform: "translateX(-50%)" }} />

        {/* Track fill */}
        <div aria-hidden="true" style={{ position: "absolute", left: 32, top: firstY, width: 5, height: fillH, background: "#1d4ed8", borderRadius: 3, transform: "translateX(-50%)", transition: "height 0.55s cubic-bezier(0.4,0,0.2,1)" }} />

        {/* Bus icon */}
        {tracking && (
          <div aria-label="Live bus position" style={{ position: "absolute", left: 32, top: by, width: BUS_SIZE_PX, height: BUS_SIZE_PX, transform: "translate(-50%,-50%)", transition: "top 0.55s cubic-bezier(0.4,0,0.2,1)", background: "#1d4ed8", border: "3px solid #fff", boxShadow: "0 0 0 2.5px #1d4ed8", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <rect x="3" y="8" width="18" height="11" rx="2" />
              <path d="M7 8V6a2 2 0 014 0v2M13 8V6a2 2 0 014 0v2" />
              <circle cx="7.5" cy="17" r="1" /><circle cx="16.5" cy="17" r="1" />
            </svg>
          </div>
        )}

        {/* Stop rows */}
        {routeStops.map((stop, i) => {
          const isFirst    = i === 0;
          const isLast     = i === n - 1;
          const isTerminus = isFirst || isLast;
          const done       = tracking && i < reached;
          const isNext     = tracking && i === reached && !isLast;

          return (
            <div key={stop.id ?? i} style={{ position: "relative", display: "flex", alignItems: "flex-start", minHeight: STOP_SPACING_PX }}>

              {/* Dot column — 64px wide, centred at x=32 */}
              <div style={{ width: 64, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: NODE_CENTER_OFFSET_Y, position: "relative", zIndex: 2 }}>
                {/* km label */}
                {!isFirst && stop.distance_from_prev_km != null ? (
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", marginBottom: 3, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
                    {stop.distance_from_prev_km} km
                  </div>
                ) : (
                  <div style={{ height: 12 }} />
                )}
                {/* Dot */}
                <div aria-hidden="true" style={{ width: isTerminus ? 20 : 14, height: isTerminus ? 20 : 14, borderRadius: "50%", border: `${isTerminus ? 3.5 : 3}px solid #1d4ed8`, background: done || isTerminus ? "#1d4ed8" : "#fff", flexShrink: 0, transition: "background 0.25s" }} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, padding: "14px 16px 10px 4px", borderBottom: isLast ? "none" : "1px solid #f1f5f9", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: done ? 400 : isNext ? 700 : isTerminus ? 700 : 500, color: done ? "#94a3b8" : isNext ? "#1d4ed8" : "#1e293b", textDecoration: done ? "line-through" : "none", lineHeight: 1.35, transition: "all 0.2s", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {stop.stop_name}
                  </div>
                  {stop.arrival_time && (
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{stop.arrival_time}</div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, paddingTop: 14 }}>
                  {isFirst && <StopBadge variant="origin">Origin</StopBadge>}
                  {isLast  && <StopBadge variant="final">Final</StopBadge>}
                  {!isTerminus && done  && <StopBadge variant="done">Done</StopBadge>}
                  {!isTerminus && isNext && (
                    <>
                      <StopBadge variant="next">Next</StopBadge>
                      {stop.eta_minutes != null && <span style={{ fontSize: 10, color: "#94a3b8" }}>~{stop.eta_minutes} min</span>}
                    </>
                  )}
                  {!isTerminus && tracking && !done && !isNext && stop.eta_minutes != null && (
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>~{stop.eta_minutes} min</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DriverDashboard — main component
// ─────────────────────────────────────────────
export default function DriverDashboard() {
  const { user, logout }  = useContext(AuthContext);
  const toast             = useContext(ToastContext);
  const navigate          = useNavigate();
  const showToast         = toast?.showToast || ((msg) => alert(msg));
  const handleLogout      = useCallback(() => { logout(); navigate("/login"); }, [logout, navigate]);

  const [page, setPage]                   = useState("trip");
  const [tracking, setTracking]           = useState(false);
  const [starting, setStarting]           = useState(false);
  const [busInfo, setBusInfo]             = useState(null);
  const [busIsStale, setBusIsStale]       = useState(false);
  const [routeStops, setRouteStops]       = useState([]);
  const [routeGeometryPositions, setRouteGeometryPositions] = useState([]);
  const [reachedStopIds, setReachedStopIds] = useState([]);
  const [nextStop, setNextStop]           = useState(null);
  const [speed, setSpeed]                 = useState(0);
  const [tripDuration, setTripDuration]   = useState(0);
  const [activeTripId, setActiveTripId]   = useState(null);
  const [tripStaleWarning, setTripStaleWarning] = useState(false);

  const watchIdRef         = useRef(null);
  const busIdRef           = useRef(null);
  const lastSendRef        = useRef(0);
  const lastSentLatRef     = useRef(null);
  const lastSentLngRef     = useRef(null);
  const tripStartRef       = useRef(null);
  const timerRef           = useRef(null);
  const startingRef        = useRef(starting);
  const lastGeoErrorAtRef  = useRef(0);
  const staleWarningTimerRef = useRef(null);

  useEffect(() => { startingRef.current = starting; }, [starting]);

  const { socketRef, isSocketConnected, positionsByBusId, smoothedPositionsByBusId, ingestPosition } = useLiveBusTracking({
    socketUrl: SOCKET_URL,
    socketAuthToken: user?.token,
    socketEnabled: Boolean(user?.token),
    joinBusIds: busInfo?.id ? [busInfo.id] : [],
    pollEnabled: false,
  });

  // ── Listen for stale trip warning from backend ──
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isSocketConnected) return;

    const onTripStaleWarning = (payload) => {
      setTripStaleWarning(true);
      showToast("Trip inactive — confirm you're still running", "warning");
      // Auto-hide warning after 5 minutes (auto-complete threshold)
      if (staleWarningTimerRef.current) clearTimeout(staleWarningTimerRef.current);
      staleWarningTimerRef.current = setTimeout(() => {
        setTripStaleWarning(false);
        showToast("Trip auto-completed due to inactivity", "error");
      }, 300000);
    };
    socket.on("trip_stale_warning", onTripStaleWarning);

    return () => {
      socket.off("trip_stale_warning", onTripStaleWarning);
      if (staleWarningTimerRef.current) clearTimeout(staleWarningTimerRef.current);
    };
  }, [isSocketConnected, showToast]);

  // ── Load dashboard ──
  useEffect(() => {
    const load = async () => {
      try {
        const dashRes   = await api.get("/drivers/me/dashboard");
        const bus       = dashRes.data?.bus || null;
        const activeTrip = dashRes.data?.active_trip || null;
        const stops     = dashRes.data?.route_stops || [];
        const invalidated = Boolean(dashRes.data?.invalidated);

        if (bus) {
          setBusInfo(bus);
          busIdRef.current = bus.id;
          setRouteStops(Array.isArray(stops) ? stops : []);
          if (bus.route_geometry_json?.coordinates) {
            setRouteGeometryPositions(toLeafletPolylinePositions(bus.route_geometry_json.coordinates));
          } else {
            setRouteGeometryPositions([]);
          }
        } else {
          setBusInfo(null);
          busIdRef.current = null;
          setRouteStops([]);
          setRouteGeometryPositions([]);
        }

        let permState = "unknown";
        try {
          if (navigator?.permissions?.query) {
            const s = await navigator.permissions.query({ name: "geolocation" });
            permState = s.state || "unknown";
          }
        } catch { /* ignore */ }

        if (activeTrip?.id) {
          if (permState === "denied") {
            showToast("Location permission denied. Trip tracking cannot run.", "error");
          } else {
            setActiveTripId(Number(activeTrip.id));
            setTracking(true);
          }
          if (activeTrip.started_at) {
            const startedAtMs = new Date(activeTrip.started_at).getTime();
            tripStartRef.current = startedAtMs;
            setTripDuration(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
            timerRef.current = setInterval(() => {
              if (!tripStartRef.current) return;
              setTripDuration(Math.max(0, Math.floor((Date.now() - tripStartRef.current) / 1000)));
            }, 1000);
          }
        }

        if (invalidated) showToast("Previous trip expired due to no location updates.", "info");
      } catch (err) { console.error("Failed to load driver dashboard:", err); }
    };
    load();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (staleWarningTimerRef.current) clearTimeout(staleWarningTimerRef.current);
    };
  }, [showToast, user]);

  const handleGeoUpdate = useCallback((pos) => {
    const now = Date.now();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const spd = pos.coords.speed != null ? pos.coords.speed * 3.6 : 0;
    const acc = pos.coords.accuracy ?? null;
    const deviceTs = new Date(pos.timestamp).toISOString();
    const MIN_DISTANCE_M = 10;
    const data = { bus_id: busIdRef.current, latitude: lat, longitude: lng, speed: spd, accuracy: acc, device_timestamp: deviceTs };
    ingestPosition(data);
    setSpeed(Math.round(spd));
    if (now - lastSendRef.current < UPDATE_INTERVAL) return;
    if (lastSentLatRef.current !== null) {
      const moved = gpsDistanceMeters(lastSentLatRef.current, lastSentLngRef.current, lat, lng);
      const timeSinceLast = now - lastSendRef.current;
      // Send heartbeat every 15s even when stationary so state machine can process dwell-time departure
      if (moved < MIN_DISTANCE_M && timeSinceLast < 15000) return;
    }
    lastSendRef.current    = now;
    lastSentLatRef.current = lat;
    lastSentLngRef.current = lng;
    api.post("/location/update", data).catch(() => {});
  }, [ingestPosition]);

  const handleGeoError = useCallback((err) => {
    const now = Date.now();
    if (now - lastGeoErrorAtRef.current >= 8000) {
      lastGeoErrorAtRef.current = now;
      showToast(geolocationErrorMessage(err), "error");
    }
  }, [showToast]);

  useEffect(() => {
    if (!tracking) {
      // Stop watch when tracking turns off
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    // Only start if not already watching
    if (watchIdRef.current != null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handleGeoUpdate(pos),
      (err) => handleGeoError(err),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [tracking, handleGeoUpdate, handleGeoError]);

  // ── Sync live bus state from socket ──
  useEffect(() => {
    const busId = Number(busInfo?.id);
    if (!Number.isFinite(busId) || busId <= 0) return;
    const payload = positionsByBusId[busId];
    if (!payload) return;
    setBusIsStale(Boolean(payload.is_stale));
    if (Array.isArray(payload.reached_stop_ids)) setReachedStopIds(payload.reached_stop_ids);
    if (payload.next_stop) setNextStop(payload.next_stop);
    if (payload.speed != null) setSpeed(Math.round(Number(payload.speed) || 0));
  }, [busInfo?.id, positionsByBusId]);

  // ── Current map position (smoothed) ──
  const currentPos = useMemo(() => {
    const busId = Number(busInfo?.id);
    if (!Number.isFinite(busId) || busId <= 0) return null;
    const smooth = smoothedPositionsByBusId[busId];
    if (Array.isArray(smooth) && smooth.length === 2) return [Number(smooth[0]), Number(smooth[1])];
    const raw = positionsByBusId[busId];
    if (raw && Number.isFinite(Number(raw.latitude)) && Number.isFinite(Number(raw.longitude))) {
      return [Number(raw.latitude), Number(raw.longitude)];
    }
    return null;
  }, [busInfo?.id, positionsByBusId, smoothedPositionsByBusId]);

  // ── Bus position (0–100) for timeline ──
  const busPos = useMemo(
    () => computeBusPos(routeStops, currentPos),
    [routeStops, currentPos]
  );

  // ── Start trip ──
  const startTrip = useCallback(async () => {
    if (!busIdRef.current) { showToast("No bus assigned", "error"); return; }
    if (tracking || startingRef.current) return;
    setStarting(true);
    try {
      const perm = await ensureGeolocationPermission();
      if (!perm.allowed) { showToast("Location permission denied. Please enable GPS.", "error"); return; }

      const firstPos = await getCurrentPositionAsync({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      const lat = firstPos?.coords?.latitude;
      const lng = firstPos?.coords?.longitude;
      if (lat == null || lng == null) { showToast("Unable to read your location. Please try again.", "error"); return; }

      const startRes = await api.post("/drivers/me/trips/start", { latitude: lat, longitude: lng });
      const trip = startRes.data?.trip;
      if (trip?.id) setActiveTripId(Number(trip.id));

      tripStartRef.current = trip?.started_at ? new Date(trip.started_at).getTime() : Date.now();
      timerRef.current = setInterval(() => {
        setTripDuration(Math.floor((Date.now() - tripStartRef.current) / 1000));
      }, 1000);

      setTracking(true);
      setReachedStopIds([]);
    } catch (err) {
      const msg = err?.code != null
        ? geolocationErrorMessage(err)
        : err?.response?.data?.message || "Unable to start trip";
      showToast(msg, "error");
    } finally {
      setStarting(false);
    }
  }, [tracking, showToast]);

  // ── Stop trip ──
  const stopTrip = useCallback(async () => {
    if (activeTripId) {
      try { await api.post("/drivers/me/trips/stop"); }
      catch (err) { showToast(err?.response?.data?.message || "Unable to stop trip", "error"); return; }
    }
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    tripStartRef.current   = null;
    lastSentLatRef.current = null;
    lastSentLngRef.current = null;
    setTracking(false);
    setTripDuration(0);
    setSpeed(0);
    setActiveTripId(null);
  }, [activeTripId, showToast]);

  const driverName = user?.name || user?.email || "Driver";
  const progressPct = routeStops.length > 0
    ? Math.round((reachedStopIds.length / routeStops.length) * 100)
    : 0;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f0f6ff", fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
        @keyframes cpb-ld { 0%,100%{opacity:.5} 50%{opacity:1} }
        .cpb-ld { animation: cpb-ld 2s ease-in-out infinite; }
        .cpb-tab:hover { color: #fff !important; }
        .cpb-row-btn:hover { background: #1e40af !important; }
        .cpb-stop-btn:hover { background: #fef2f2 !important; }
        .leaflet-container { font-family: 'DM Sans', sans-serif !important; }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ background: "#1d4ed8", padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: "rgba(255,255,255,.18)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="13" rx="2" />
              <path d="M8 7V5a2 2 0 014 0v2M14 7V5a2 2 0 014 0v2" />
              <circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>Driver panel</div>
            <div style={{ fontSize: 11, color: "#93c5fd", marginTop: 1 }}>{driverName} · {busInfo ? busInfo.bus_number : "No bus assigned"}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tracking && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: busIsStale ? "#fcd34d" : "#fff", background: busIsStale ? "rgba(252,211,77,.15)" : "rgba(255,255,255,.15)", border: `1px solid ${busIsStale ? "rgba(252,211,77,.3)" : "rgba(255,255,255,.25)"}`, borderRadius: 20, padding: "4px 10px" }}>
              <span className="cpb-ld" style={{ width: 6, height: 6, borderRadius: "50%", background: busIsStale ? "#fcd34d" : "#4ade80", display: "inline-block" }} />
              {busIsStale ? "Signal stale" : "Live"}
            </div>
          )}
          {!tracking && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#93c5fd", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 20, padding: "4px 10px" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /></svg>
              Idle
            </div>
          )}
          <button onClick={handleLogout} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Stale trip warning banner ── */}
      {tripStaleWarning && (
        <div style={{
          background: '#fee2e2',
          border: '2px solid #fca5a5',
          borderRadius: 12,
          padding: '13px 16px',
          margin: '12px 14px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', margin: 0, lineHeight: 1.3 }}>
              ⚠️ Trip Inactive for 15 Minutes
            </p>
            <p style={{ fontSize: 11, color: '#991b1b', marginTop: 5, margin: 0, lineHeight: 1.3 }}>
              Confirm you're still running or your trip will auto-complete in 5 minutes
            </p>
          </div>
          <button
            onClick={() => {
              setTripStaleWarning(false);
              if (staleWarningTimerRef.current) clearTimeout(staleWarningTimerRef.current);
              api.get(`/drivers/me/active-trip`).catch(() => {});
              showToast("Trip confirmed. Keep driving!", "success");
            }}
            style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#b91c1c'}
            onMouseLeave={(e) => e.target.style.background = '#dc2626'}
          >
            Still Running
          </button>
        </div>
      )}

      {/* ── TABS ── */}
      <div style={{ display: "flex", background: "#1e40af", padding: "0 16px" }}>
        {["trip", "map", "history"].map((t) => (
          <button key={t} onClick={() => setPage(t)} className="cpb-tab" style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, color: page === t ? "#fff" : "rgba(255,255,255,.5)", border: "none", background: "none", cursor: "pointer", borderBottom: `2px solid ${page === t ? "#60a5fa" : "transparent"}`, transition: "all .15s", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── BODY ── */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "14px 14px 32px" }}>

        {/* ── TRIP TAB ── */}
        {page === "trip" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 11, padding: "11px 13px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" /></svg>
                  Speed
                </div>
                <div style={{ fontSize: 21, fontWeight: 700, color: "#1e3a8a", letterSpacing: "-.5px" }}>{speed}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>km/h{tracking ? " · moving" : " · stationary"}</div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 11, padding: "11px 13px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  Duration
                </div>
                <div style={{ fontSize: 21, fontWeight: 700, color: "#1e3a8a", letterSpacing: "-.5px" }}>{tracking ? formatDuration(tripDuration) : "—"}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{tracking ? "trip running" : "not started"}</div>
              </div>

              <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 11, padding: "11px 13px", gridColumn: "1/-1" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  Stops completed
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <div style={{ fontSize: 21, fontWeight: 700, color: "#1e3a8a", letterSpacing: "-.5px" }}>{reachedStopIds.length}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>of {routeStops.length}{tracking ? ` · ${routeStops.length - reachedStopIds.length} left` : ""}</div>
                </div>
              </div>
            </div>

            {/* Next stop card */}
            {nextStop && tracking && (
              <div style={{ background: "#1d4ed8", borderRadius: 12, padding: "13px 15px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "#93c5fd", textTransform: "uppercase", marginBottom: 3 }}>Next stop</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-.2px", marginBottom: 9 }}>{nextStop.name || nextStop.stop_name}</div>
                <div style={{ display: "flex", gap: 7 }}>
                  {nextStop.eta_minutes != null && (
                    <div style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 7, padding: "5px 9px", fontSize: 11, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                      ~{nextStop.eta_minutes} min
                    </div>
                  )}
                  {nextStop.distance_km != null && (
                    <div style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 7, padding: "5px 9px", fontSize: 11, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /></svg>
                      {(nextStop.distance_km * 1000).toFixed(0)}m
                    </div>
                  )}
                </div>
                {/* Progress bar */}
                <div style={{ marginTop: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#93c5fd", marginBottom: 4 }}>
                    <span>Trip progress</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,.2)", borderRadius: 3 }}>
                    <div style={{ width: `${progressPct}%`, height: 3, background: "#fff", borderRadius: 3, transition: "width .5s ease" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Timeline header */}
            {routeStops.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 12px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>Route timeline</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8" }}>
                    {tracking ? `${reachedStopIds.length} of ${routeStops.length} done` : `${routeStops.length} stops`}
                  </span>
                </div>
                <div style={{ paddingBottom: 16 }}>
                  <DriverTimeline
                    routeStops={routeStops}
                    reachedStopIds={reachedStopIds}
                    nextStop={nextStop}
                    busPos={busPos}
                    tracking={tracking}
                  />
                </div>
              </div>
            )}

            {/* Pre-trip checklist */}
            {!tracking && busInfo && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  `Bus ${busInfo.bus_number} assigned`,
                  "GPS signal ready",
                  `Route loaded · ${routeStops.length} stops`,
                ].map((label) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid #bfdbfe", borderRadius: 9, padding: "9px 12px", fontSize: 12, fontWeight: 500, color: "#1e3a8a" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#dbeafe", border: "1px solid #93c5fd", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
                    </div>
                    {label}
                  </div>
                ))}
              </div>
            )}

            {/* Start / Stop button */}
            <button
              onClick={tracking ? stopTrip : startTrip}
              disabled={!busInfo || starting}
              className={tracking ? "cpb-stop-btn" : "cpb-row-btn"}
              style={{
                width: "100%", padding: 14, border: tracking ? "1.5px solid #fca5a5" : "none",
                borderRadius: 12,
                background: tracking ? "#fff" : "#1d4ed8",
                color: tracking ? "#dc2626" : "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background .15s", opacity: (!busInfo || starting) ? 0.45 : 1,
              }}
            >
              {tracking ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                  End trip
                </>
              ) : starting ? "Starting..." : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                  Start trip
                </>
              )}
            </button>

            {!busInfo && (
              <p style={{ textAlign: "center", fontSize: 11, color: "#b45309" }}>No bus assigned to your account</p>
            )}
          </div>
        )}

        {/* ── MAP TAB ── */}
        {page === "map" && (
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #bfdbfe", background: "#fff", height: "calc(100vh - 190px)" }}>
            {currentPos ? (
              <MapContainer center={currentPos} zoom={15} style={{ height: "100%", width: "100%" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapFollow position={currentPos} />
                {(routeGeometryPositions.length > 1 || routeStops.length > 1) && (
                  <Polyline
                    positions={routeGeometryPositions.length > 1 ? routeGeometryPositions : routeStops.map(s => [Number(s.latitude), Number(s.longitude)])}
                    color="#1d4ed8" weight={4} opacity={0.75}
                  />
                )}
                {routeStops.map(stop => (
                  <Marker key={stop.id} position={[Number(stop.latitude), Number(stop.longitude)]} icon={reachedStopIds.includes(stop.id) ? STOP_ICON_REACHED : STOP_ICON_PENDING}>
                    <Popup><p style={{ fontWeight: 600, fontSize: 13 }}>{stop.stop_name}</p></Popup>
                  </Marker>
                ))}
                <Marker position={currentPos} icon={driverIcon}>
                  <Popup><p style={{ fontWeight: 700 }}>Your position</p><p style={{ fontSize: 11, color: "#64748b" }}>{speed} km/h</p></Popup>
                </Marker>
              </MapContainer>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#bfdbfe" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <p style={{ fontSize: 13, color: "#94a3b8" }}>Start a trip to see your live position</p>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {page === "history" && (
          <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "40px 16px", textAlign: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#bfdbfe" strokeWidth="1.5" style={{ margin: "0 auto 10px" }}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <p style={{ fontSize: 13, color: "#94a3b8" }}>Trip history coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}