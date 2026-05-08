import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GoogleMap, InfoWindow, Marker, Polyline } from "@react-google-maps/api";
import api from "../../api/api";
import useLiveBusTracking from "../../hooks/useLiveBusTracking";
import { useGoogleMaps } from "../../context/GoogleMapsContext";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const MAP_CONTAINER_STYLE = { height: "100%", width: "100%" };
const MAP_ZOOM = 13;

// ── Polyline colors — green variants for consistent map styling ──
const COLOR_COMPLETED = "#16a34a";
const COLOR_UPCOMING = "#22c55e";

// ── Bus marker ──

// ── Stop status config ──
const STATUS = {
  departed: { dotBg: "#94a3b8", glow: null, label: "departed", labelColor: "#94a3b8", nameCls: "done" },
  arrived: { dotBg: "#16a34a", glow: "0 0 0 3px rgba(22,163,74,0.15)", label: "arrived", labelColor: "#16a34a", nameCls: "active" },
  approaching: { dotBg: "#1d4ed8", glow: "0 0 0 3px rgba(29,78,216,0.18)", label: "approaching", labelColor: "#1d4ed8", nameCls: "active" },
  pending: { dotBg: null, glow: null, label: "", labelColor: "#cbd5e1", nameCls: "pending" },
};

const STOP_SPACING_PX = 74;
const TIMELINE_PADDING_TOP_PX = 20;
const TIMELINE_MIN_HEIGHT_PX = 340;
const TIMELINE_LEFT_PADDING_PX = 12;
const TIMELINE_NODE_COLUMN_WIDTH_PX = 32;
const TIMELINE_NODE_SIZE_PX = 12;
const TIMELINE_BUS_SIZE_PX = 20;
const TIMELINE_CENTER_X_PX = TIMELINE_LEFT_PADDING_PX + TIMELINE_NODE_COLUMN_WIDTH_PX / 2;
const TIMELINE_NODE_CENTER_OFFSET_Y_PX = 8;

function getStatus(s) { return STATUS[s] || STATUS.pending; }


// ── Closest point split ──
// Finds the index in `polyline` geographically nearest to `stop`,
// then splits into completed (0..idx) and upcoming (idx..) arrays.
function splitPolylineAtStop(polyline, stop) {
  if (!stop || polyline.length < 2) {
    return { completedPolyline: [], upcomingPolyline: polyline };
  }
  const lat = Number(stop.stop_lat ?? stop.latitude);
  const lng = Number(stop.stop_lng ?? stop.longitude);
  // Latitude-corrected distance squared (no sqrt needed — only for comparison)
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let closestIdx = 0;
  let minDist = Infinity;
  polyline.forEach(([pLat, pLng], i) => {
    const dLat = pLat - lat;
    const dLng = (pLng - lng) * cosLat;
    const d = dLat * dLat + dLng * dLng;
    if (d < minDist) { minDist = d; closestIdx = i; }
  });
  return {
    completedPolyline: polyline.slice(0, closestIdx + 1),
    upcomingPolyline: polyline.slice(closestIdx),
  };
}

function clampProgress(progress) {
  const value = Number(progress);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isValidLatLng(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
}

function toGoogleLatLng(lat, lng) {
  if (!isValidLatLng(lat, lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

function toLatLngPairsFromGeometry(coordinates) {
  if (!Array.isArray(coordinates)) return [];

  return coordinates
    .map((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!isValidLatLng(lat, lng)) return null;
      return [lat, lng];
    })
    .filter(Boolean);
}

function toGooglePolylinePath(latLngPairs) {
  if (!Array.isArray(latLngPairs)) return [];

  return latLngPairs
    .map((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      return toGoogleLatLng(pair[0], pair[1]);
    })
    .filter(Boolean);
}

function escapeSvgText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createBusMarkerIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="17" fill="rgba(29,78,216,0.25)" />
      <circle cx="18" cy="18" r="15" fill="#1d4ed8" stroke="#ffffff" stroke-width="3" />
      <g transform="translate(10 10)">
        <path d="M3 17h18M5 17V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8M9 17v2m6-2v2M7 13h2m4 0h2"
          fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(36, 36),
    anchor: new window.google.maps.Point(18, 18),
  };
}

function createStopMarkerIcon(status) {
  const cfg = getStatus(status);
  const bg = cfg.dotBg || "#fff";
  const border = cfg.dotBg ? "#fff" : "#e2e8f0";
  const glow = cfg.glow || "none";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="4" fill="${bg}" stroke="${border}" stroke-width="2" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(12, 12),
    anchor: new window.google.maps.Point(6, 6),
    labelOrigin: new window.google.maps.Point(6, 6),
    optimized: false,
    shadow: glow === "none" ? undefined : {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7" fill="${cfg.dotBg || "#1d4ed8"}" fill-opacity="0.18" />
        </svg>
      `)}`,
      scaledSize: new window.google.maps.Size(18, 18),
      anchor: new window.google.maps.Point(9, 9),
    },
  };
}

function LiveBusTimeline({ stops, currentStopIndex, nextStopIndex, progress }) {
  const containerRef = useRef(null);
  const boundedCurrentIndex = Math.max(0, Math.min(stops.length - 1, Number(currentStopIndex) || 0));
  const clampedProgress = clampProgress(progress);
  const firstNodeY = TIMELINE_PADDING_TOP_PX + TIMELINE_NODE_CENTER_OFFSET_Y_PX;
  const lastNodeY = firstNodeY + Math.max(0, stops.length - 1) * STOP_SPACING_PX;
  const routeEndY = lastNodeY + 28;
  const busTop =
    firstNodeY +
    (boundedCurrentIndex + clampedProgress) * STOP_SPACING_PX;
  const contentHeight = Math.max(
    TIMELINE_MIN_HEIGHT_PX,
    routeEndY + 34
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const targetScrollTop = Math.max(0, busTop - container.clientHeight / 2);
    container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
  }, [busTop, stops.length]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-y-auto rounded-xl border-2 border-blue-200 bg-linear-to-b from-white to-blue-50/60"
      style={{ maxHeight: 460 }}
    >
      <div className="relative" style={{ height: contentHeight }}>
        <div
          className="absolute w-1 bg-blue-500"
          style={{
            left: TIMELINE_CENTER_X_PX - 2,
            top: firstNodeY,
            height: Math.max(0, routeEndY - firstNodeY),
            opacity: 0.35,
          }}
          aria-hidden="true"
        />

        <div
          className="absolute w-1 bg-blue-600"
          style={{
            left: TIMELINE_CENTER_X_PX - 2,
            top: firstNodeY,
            height: Math.max(0, Math.min(routeEndY - firstNodeY, busTop - firstNodeY)),
            opacity: 0.95,
          }}
          aria-hidden="true"
        />

        <div
          className="absolute z-10"
          style={{
            left: TIMELINE_CENTER_X_PX - 12,
            top: busTop,
            transform: "translateY(-50%)",
            transition: "top 320ms ease",
          }}
          aria-label="Live bus position"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-xs leading-none shadow-sm ring-2 ring-blue-200/80">
            🚍
          </div>
        </div>

        {stops.map((stop, idx) => {
          const isCurrent = idx === currentStopIndex;
          const isNext = idx === nextStopIndex;
          const isPassed = idx < currentStopIndex;
          const isUpcoming = idx > currentStopIndex;

          return (
            <div
              key={stop.id}
              className="absolute left-0 right-0"
              style={{ top: firstNodeY + idx * STOP_SPACING_PX - 8 }}
            >
              <div className="flex items-start gap-4 px-3" style={{ minHeight: 66 }}>
                <div className="w-8 flex justify-center">
                  <span
                    className={`mt-0.5 inline-block h-3.5 w-3.5 rounded-full border-2 ${isCurrent || isPassed ? "bg-blue-600 border-blue-600" : "bg-white border-blue-500"}`}
                    style={{ opacity: isPassed ? 0.45 : 1 }}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className={`text-sm leading-5 ${isCurrent ? "font-bold text-blue-900" : "font-semibold text-slate-700"}`} style={{ opacity: isPassed ? 0.75 : 1 }}>
                    {stop.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500" style={{ opacity: isPassed ? 0.7 : 1 }}>{stop.arrival_time || "--:--"}</div>
                  {isNext && (
                    <div className="mt-1 inline-flex rounded-full border-2 border-blue-300 bg-blue-100/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                      Next stop
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {stops.length > 0 && (
          <div
            className="absolute"
            style={{ left: TIMELINE_CENTER_X_PX - 6, top: routeEndY - 6 }}
            aria-hidden="true"
          >
            <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-blue-500 bg-white" />
          </div>
        )}

        {stops.length > 0 && (
          <div
            className="absolute text-[11px] font-bold uppercase tracking-wide text-blue-700"
            style={{ left: TIMELINE_LEFT_PADDING_PX + TIMELINE_NODE_COLUMN_WIDTH_PX + 16, top: routeEndY - 10 }}
          >
            Route end
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackTripPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const tripIdRef = useRef(tripId);
  const mapRef = useRef(null);
  const mapInitializedRef = useRef(false);
  const iconCacheRef = useRef({ bus: null, stop: {} });

  const { isLoaded: isGoogleMapLoaded, loadError: googleMapsLoadError, apiKey: GOOGLE_MAPS_API_KEY } = useGoogleMaps();

  const [tab, setTab] = useState("timeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeline, setTimeline] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState([]);
  const [selectedBoardingStop, setSelectedBoardingStop] = useState(null);
  const [lastUpdateAge, setLastUpdateAge] = useState(0);
  const [selectedMapInfo, setSelectedMapInfo] = useState(null);

  const pollBusLocation = useCallback(async () => {
    if (!timeline?.bus_id) return [];
    const res = await api.get(`/location/bus/${timeline.bus_id}`);
    if (!res?.data) return [];
    return [{ ...res.data, bus_id: timeline.bus_id }];
  }, [timeline?.bus_id]);

  const handleTripStopUpdate = useCallback((p) => {
    if (!p || Number(p.trip_id) !== Number(tripIdRef.current)) return;

    if (p.status === "completed" || p.trip_status === "completed") {
      setTimeline((prev) => prev ? { ...prev, status: "completed", trip_status: "completed" } : prev);
      return;
    }

    setTimeline((prev) => {
      if (!prev) return prev;

      // If backend sent a full stops array, use it directly
      if (Array.isArray(p.stops)) {
        return {
          ...prev,
          stops: p.stops,
          status: p.status || prev.status,
          trip_status: p.trip_status || p.status || prev.trip_status,
        };
      }

      // If backend sent individual stop state change (stopId + toState), patch just that stop
      if (p.stopId != null && p.toState != null) {
        const updatedStops = prev.stops.map((stop) => {
          const id = stop.stop_id ?? stop.id;
          if (Number(id) === Number(p.stopId)) {
            return {
              ...stop,
              state: p.toState,
              status: p.toState,
              arrived_at: p.toState === "arrived" ? new Date().toISOString() : stop.arrived_at,
            };
          }
          return stop;
        });
        return { ...prev, stops: updatedStops };
      }

      return prev;
    });
  }, []);

  const handleTripCompleted = useCallback((p) => {
    if (!p || Number(p.trip_id) !== Number(tripIdRef.current)) return;
    setTimeline((prev) => prev ? { ...prev, status: "completed", trip_status: "completed" } : prev);
  }, []);

  // BUG4-FIX: Use stable refs for socket handlers so socketAdditionalEvents
  // identity never changes, preventing listener teardown gaps that drop events.
  const tripStopUpdateHandlerRef = useRef(null);
  const tripCompletedHandlerRef = useRef(null);
  useEffect(() => { tripStopUpdateHandlerRef.current = handleTripStopUpdate; });
  useEffect(() => { tripCompletedHandlerRef.current = handleTripCompleted; });

  const socketAdditionalEvents = useMemo(() => ({
    trip_stop_update: (data) => tripStopUpdateHandlerRef.current?.(data),
    trip_completed: (data) => tripCompletedHandlerRef.current?.(data),
  }), []); // empty deps — stable identity forever

  // BUG5-FIX: Memoize joinBusIds to prevent new array identity on every render
  const joinBusIds = useMemo(
    () => (timeline?.bus_id ? [timeline.bus_id] : []),
    [timeline?.bus_id]
  );

  const { positionsByBusId, smoothedPositionsByBusId, isSocketConnected } = useLiveBusTracking({
    socketUrl: SOCKET_URL,
    socketEnabled: true,
    socketAdditionalEvents: socketAdditionalEvents,
    joinBusIds,
    pollEnabled: Boolean(timeline?.bus_id),
    pollWhileSocketConnected: false,
    pollIntervalMs: 4000,
    pollFetcher: pollBusLocation,
  });

  // TASK2: Connection lost / reconnected banners
  const [reconnectToast, setReconnectToast] = useState(false);
  const prevConnectedRef = useRef(true);
  useEffect(() => {
    if (!prevConnectedRef.current && isSocketConnected) {
      setReconnectToast(true);
      const timer = setTimeout(() => setReconnectToast(false), 3000);
      return () => clearTimeout(timer);
    }
    prevConnectedRef.current = isSocketConnected;
  }, [isSocketConnected]);

  // TASK3: Fetch timeline function (extracted so polling can re-use it)
  const fetchTimeline = useCallback(async () => {
    if (!tripId) return;
    try {
      setError("");
      const res = await api.get(`/trips/${tripId}/timeline`);
      setTimeline(res.data);
    } catch (err) {
      console.error(err);
      setError("Unable to load tracking details.");
    }
  }, [tripId]);

  // ── Load trip ──
  useEffect(() => {
    const load = async () => {
      if (!tripId) return;
      setLoading(true);
      await fetchTimeline();
      setLoading(false);
    };
    load();
  }, [tripId, fetchTimeline]);

  // TASK3: Detect scheduled/not-started trips
  const tripNotStarted = timeline &&
    (timeline.trip_status === 'scheduled' || !timeline.started_at);

  // TASK3: Poll every 30s when trip hasn't started to detect when driver begins
  useEffect(() => {
    if (!tripNotStarted) return;
    const interval = setInterval(fetchTimeline, 30000);
    return () => clearInterval(interval);
  }, [tripNotStarted, fetchTimeline]);

  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  // ── Load route geometry ──
  useEffect(() => {
    const load = async () => {
      if (!timeline?.route_id) { setRouteGeometry([]); return; }
      try {
        const res = await api.get(`/routes/${timeline.route_id}/geometry`);
        const coords = res.data?.geometry?.coordinates;
        setRouteGeometry(toLatLngPairsFromGeometry(coords));
      } catch (err) { console.error("Failed to load route geometry:", err); setRouteGeometry([]); }
    };
    load();
  }, [timeline?.route_id]);

  // ── Auto-detect user's boarding stop ──
  useEffect(() => {
    if (!timeline?.stops) return;

    // Auto-detect: user wants to board at the next non-departed stop
    const boarding = timeline.stops.find(s =>
      (s.state ?? s.status) === 'approaching' || (s.state ?? s.status) === 'pending'
    );

    if (boarding) {
      setSelectedBoardingStop(boarding);
    }
  }, [timeline?.stops, tripId]);

  // ── Derived ──
  const stopPolyline = useMemo(() =>
    (timeline?.stops || []).map((s) => [Number(s.stop_lat ?? s.latitude), Number(s.stop_lng ?? s.longitude)]),
    [timeline?.stops]
  );

  const mapPolyline = useMemo(() =>
    routeGeometry.length > 1 ? routeGeometry : stopPolyline,
    [routeGeometry, stopPolyline]
  );

  // Find the approaching stop (or first pending if none approaching)
  const approachingStop = useMemo(() =>
    (timeline?.stops || []).find((s) => (s.state ?? s.status) === "approaching") ||
    (timeline?.stops || []).find((s) => (s.state ?? s.status) === "pending") ||
    null,
    [timeline?.stops]
  );

  // Create a synthetic "stop-like" object from the bus's current GPS position
  // live payload for the bus (raw positions from socket/poll)
  const liveBusPayload = useMemo(() => {
    const busId = Number(timeline?.bus_id);
    if (!Number.isFinite(busId) || busId <= 0) return null;
    return positionsByBusId[busId] || null;
  }, [positionsByBusId, timeline?.bus_id]);

  // ── Update GPS age counter every second ──
  useEffect(() => {
    if (!liveBusPayload?.updated_at) return;

    const updateAge = () => {
      const age = Math.floor((Date.now() - new Date(liveBusPayload.updated_at).getTime()) / 1000);
      setLastUpdateAge(age);
    };

    updateAge();
    const interval = setInterval(updateAge, 1000);
    return () => clearInterval(interval);
  }, [liveBusPayload?.updated_at]);

  // Compute canonical `busPosition` from raw sources in order of trust.
  // Placing this early in the hook order avoids TDZs for downstream derived memos.
  const busPosition = useMemo(() => {
    const busId = Number(timeline?.bus_id);
    if (!Number.isFinite(busId) || busId <= 0) return null;

    const smooth = smoothedPositionsByBusId[busId];
    if (Array.isArray(smooth) && smooth.length === 2 && isValidLatLng(smooth[0], smooth[1])) {
      return [Number(smooth[0]), Number(smooth[1])];
    }

    if (isValidLatLng(liveBusPayload?.latitude, liveBusPayload?.longitude)) {
      return [Number(liveBusPayload.latitude), Number(liveBusPayload.longitude)];
    }

    if (isValidLatLng(timeline?.bus_lat, timeline?.bus_lng)) {
      return [Number(timeline.bus_lat), Number(timeline.bus_lng)];
    }

    return null;
  }, [smoothedPositionsByBusId, liveBusPayload?.latitude, liveBusPayload?.longitude, timeline?.bus_id, timeline?.bus_lat, timeline?.bus_lng]);

  // Create a synthetic "stop-like" object from the bus's current GPS position
  // Note: depends on `busPosition` which is now computed above.
  const busPositionAsStop = useMemo(() => {
    if (!busPosition) return null;
    return { latitude: busPosition[0], longitude: busPosition[1] };
  }, [busPosition]);

  // Accurate closest-point split — use live bus position for split point
  const { completedPolyline, upcomingPolyline } = useMemo(() =>
    splitPolylineAtStop(mapPolyline, busPositionAsStop ?? approachingStop),
    [mapPolyline, busPositionAsStop, approachingStop]
  );

  const mapCenter = useMemo(() => {
    if (busPosition) return busPosition;
    if (mapPolyline.length > 0) return mapPolyline[0];
    return [30.7333, 76.7794];
  }, [busPosition, mapPolyline]);

  const mapCenterLatLng = useMemo(
    () => toGoogleLatLng(mapCenter[0], mapCenter[1]),
    [mapCenter]
  );

  const busPositionLatLng = useMemo(
    () => (Array.isArray(busPosition) ? toGoogleLatLng(busPosition[0], busPosition[1]) : null),
    [busPosition]
  );

  const completedRoutePath = useMemo(
    () => toGooglePolylinePath(completedPolyline),
    [completedPolyline]
  );

  const upcomingRoutePath = useMemo(
    () => toGooglePolylinePath(upcomingPolyline),
    [upcomingPolyline]
  );

  const getBusMarkerIcon = useCallback(() => {
    if (!window.google?.maps) return null;
    if (!iconCacheRef.current.bus) {
      iconCacheRef.current.bus = createBusMarkerIcon();
    }
    return iconCacheRef.current.bus;
  }, []);

  const getStopMarkerIcon = useCallback((status) => {
    if (!window.google?.maps) return null;
    const key = String(status || "pending");
    if (!iconCacheRef.current.stop[key]) {
      iconCacheRef.current.stop[key] = createStopMarkerIcon(key);
    }
    return iconCacheRef.current.stop[key];
  }, []);

  useEffect(() => {
    if (!selectedMapInfo) return;
    if (selectedMapInfo.type === "bus") {
      if (!busPositionLatLng) setSelectedMapInfo(null);
      return;
    }

    const stopExists = (timeline?.stops || []).some(
      (stop) => Number(stop.stop_id ?? stop.id) === Number(selectedMapInfo.stopId)
    );
    if (!stopExists) setSelectedMapInfo(null);
  }, [busPositionLatLng, selectedMapInfo, timeline?.stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !busPositionLatLng || !window.google?.maps) return;

    if (!mapInitializedRef.current) {
      mapInitializedRef.current = true;
      map.setCenter(busPositionLatLng);
      map.setZoom(MAP_ZOOM);
      return;
    }

    const center = map.getCenter();
    if (!center) {
      map.setCenter(busPositionLatLng);
      return;
    }

    const distanceM = window.google.maps.geometry?.spherical?.computeDistanceBetween
      ? window.google.maps.geometry.spherical.computeDistanceBetween(center, busPositionLatLng)
      : 0;

    if (distanceM < 8) return;
    map.panTo(busPositionLatLng);
  }, [busPositionLatLng]);

  const nextStop = approachingStop;
  const busSpeed = Math.round(Number(liveBusPayload?.speed) || 0);
  const isStale = Boolean(liveBusPayload?.is_stale);
  const isCompleted = String((timeline?.trip_status ?? timeline?.status) || "").toLowerCase() === "completed";
  const stops = timeline?.stops || [];
  const completedStops = stops.filter((s) => (s.state ?? s.status) === "departed" || (s.state ?? s.status) === "arrived").length;
  const derivedCurrentStopIdx = Math.max(0, stops.findIndex((s) => (s.state ?? s.status) === "approaching" || (s.state ?? s.status) === "arrived"));
  const currentStopIndex = Number.isFinite(Number(timeline?.currentStopIndex))
    ? Math.max(0, Math.min(stops.length - 1, Number(timeline.currentStopIndex)))
    : derivedCurrentStopIdx;
  const nextStopIndex = Number.isFinite(Number(timeline?.nextStopIndex))
    ? Math.max(0, Math.min(stops.length - 1, Number(timeline.nextStopIndex)))
    : Math.min(stops.length - 1, currentStopIndex + 1);
  const progress = clampProgress(timeline?.progress ?? liveBusPayload?.progress ?? 0);
  const progressPct = stops.length > 0 ? Math.min(100, Math.round((completedStops / stops.length) * 100)) : 0;
  const timelineStops = useMemo(
    () =>
      stops.map((s, idx) => ({
        id: String(s.stop_id ?? s.id ?? idx),
        name: s.stop_name ?? s.name ?? `Stop ${idx + 1}`,
        arrival_time: s.arrived_at ?? s.arrival_time ?? s.scheduled_time ?? s.time ?? "--:--",
        lat: Number(s.stop_lat ?? s.latitude ?? s.lat ?? 0),
        lng: Number(s.stop_lng ?? s.longitude ?? s.lng ?? 0),
      })),
    [stops]
  );

  // ── Loading ──
  if (loading) return (
    <>
      <style>{`
        @keyframes cpb-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#f8fbff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center", background: "#fff", border: "1px solid #dbeafe", borderRadius: 16, padding: "22px 30px", boxShadow: "0 12px 28px rgba(30,64,175,0.12)" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "cpb-spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "#475569" }}>Loading trip...</p>
        </div>
      </div>
    </>
  );

  // ── Error ──
  if (error || !timeline) return (
    <>
      <style>{`@keyframes cpb-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ minHeight: "100vh", background: "#f8fbff", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: "22px 24px", background: "#fff", border: "1px solid #dbeafe", borderRadius: 16, boxShadow: "0 12px 28px rgba(30,64,175,0.12)" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style={{ color: "#e2e8f0", margin: "0 auto 12px", display: "block" }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 7v6M12 16v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <p style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, color: "#1e293b" }}>{error || "Trip not found"}</p>
          <button type="button" onClick={() => navigate("/user")}
            style={{ marginTop: 14, height: 36, padding: "0 20px", background: "#1d4ed8", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Back to search
          </button>
        </div>
      </div>
    </>
  );

  // TASK3: Show waiting state for trips that haven't started
  if (!loading && !error && tripNotStarted) return (
    <>
      <style>{`
        @keyframes cpb-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#f8fbff", fontFamily: "'DM Sans', sans-serif" }}>
        {/* TASK2: Connection banners */}
        {!isSocketConnected && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
            background: "#ef4444", color: "#fff", textAlign: "center",
            padding: "10px 16px", fontSize: 14, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8
          }}>
            <span>⚡</span>
            <span>Connection lost — reconnecting...</span>
          </div>
        )}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "60vh", padding: "32px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🚌</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1e3a8a", marginBottom: 8 }}>
            Trip hasn&apos;t started yet
          </h2>
          <p style={{ color: "#64748b", maxWidth: 300, marginBottom: 24 }}>
            The driver hasn&apos;t begun this trip. This page will update automatically
            when the bus starts moving.
          </p>
          <div style={{
            background: "#f0f6ff", borderRadius: 12, padding: "12px 20px",
            fontSize: 13, color: "#1d4ed8", fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6
          }}>
            <div style={{ width: 14, height: 14, border: "2px solid #93c5fd", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "cpb-spin 0.8s linear infinite" }} />
            Checking for updates...
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes cpb-ripple { 0%{transform:scale(1);opacity:0.35} 100%{transform:scale(2.4);opacity:0} }
        @keyframes cpb-blink  { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .cpb-live    { animation: cpb-blink 1.5s ease-in-out infinite; }
        .cpb-aproach { animation: cpb-blink 1.2s ease-in-out infinite; }
        .cpb-back:hover    { background: #eff6ff !important; border-color: #bfdbfe !important; }
        .cpb-tab-off:hover { border-color: #bfdbfe !important; color: #1d4ed8 !important; }
        .cpb-again:hover   { background: #1e40af !important; }

        .cpb-light-card {
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          border: 1px solid #bfdbfe;
          box-shadow: 0 14px 34px rgba(30,64,175,0.12);
        }

        .cpb-section-title {
          color: #0f172a;
          letter-spacing: -0.01em;
        }

        @media (max-width: 768px) {
          .cpb-top-title { font-size: 15px !important; }
        }

      `}</style>

      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f6faff 0%,#edf4ff 46%,#e9f2ff 100%)", fontFamily: "'DM Sans', sans-serif" }}>

        {!isSocketConnected && !tripNotStarted && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
            background: "#ef4444", color: "#fff", textAlign: "center",
            padding: "10px 16px", fontSize: 14, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8
          }}>
            <span>⚡</span>
            <span>Connection lost — reconnecting...</span>
          </div>
        )}

        {reconnectToast && !tripNotStarted && (
          <div style={{
            position: "fixed", top: !isSocketConnected ? 42 : 0, left: 0, right: 0, zIndex: 9999,
            background: "#16a34a", color: "#fff", textAlign: "center",
            padding: "8px 16px", fontSize: 13, fontWeight: 600,
          }}>
            Reconnected — live updates resumed
          </div>
        )}

        {/* ── NAVBAR ── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: "rgba(255,255,255,0.92)",
          borderBottom: "1px solid #bfdbfe",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          padding: "0 24px", height: 58,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" onClick={() => navigate("/user")} className="cpb-back" aria-label="Back"
              style={{ width: 34, height: 34, borderRadius: 8, background: "#f8fafc", border: "1px solid #dbeafe", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#334155", transition: "all 0.15s" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <div className="cpb-top-title" style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 800, color: "#0f172a", letterSpacing: -0.3 }}>ChaloPB</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Trip tracking</div>
            </div>
          </div>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: isCompleted ? "#fffbeb" : "#f0fdf4",
            color: isCompleted ? "#b45309" : "#15803d",
            border: `1px solid ${isCompleted ? "#fde68a" : "#bbf7d0"}`,
          }}>
            <span className={isCompleted ? undefined : "cpb-live"}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
            {isCompleted ? "Completed" : "Active"}
          </div>
        </header>

        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 56px" }}>

          {/* Completed banner */}
          {isCompleted && (
            <div className="cpb-light-card" style={{ background: "#fffbeb", borderColor: "#fde68a", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>This trip has ended.</p>
              <button type="button" onClick={() => navigate("/user")} className="cpb-again"
                style={{ height: 32, padding: "0 14px", background: "#1d4ed8", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap", transition: "background 0.15s" }}>
                Search again
              </button>
            </div>
          )}

          {isStale && !isCompleted && busPosition && (
            <div style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 12,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4M12 16.5v.5M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  stroke="#b45309" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p style={{ fontSize: 12, color: "#92400e", fontWeight: 500, margin: 0 }}>
                GPS signal lost — showing last known location
              </p>
            </div>
          )}

          {/* ── HERO ETA CARD ── */}
          {selectedBoardingStop && (
            <div className="cpb-light-card" style={{
              borderRadius: 16,
              padding: "18px 20px",
              marginBottom: 12,
              background: "linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)",
              color: "white",
              position: "relative",
              overflow: "hidden"
            }}>
              <div aria-hidden="true" style={{ position: "absolute", top: "-40%", right: "-20%", width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />

              <div style={{ position: "relative", zIndex: 1 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  ⏱️ Arrives at your stop
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                  <p style={{ fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: "-2px" }}>
                    {(selectedBoardingStop?.state ?? selectedBoardingStop?.status) === 'departed' ? '✅' : selectedBoardingStop?.eta_minutes ? `~${selectedBoardingStop.eta_minutes}` : '—'}
                  </p>
                  {(selectedBoardingStop?.state ?? selectedBoardingStop?.status) !== 'departed' && (
                    <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "rgba(255,255,255,0.9)" }}>min</p>
                  )}
                  {(selectedBoardingStop?.state ?? selectedBoardingStop?.status) === 'departed' && (
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "rgba(255,255,255,0.9)" }}>Completed</p>
                  )}
                </div>

                <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px", color: "rgba(255,255,255,0.95)", lineHeight: 1.3 }}>
                  {selectedBoardingStop?.stop_name}
                </p>

                <div style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
                  Next stop: {nextStop?.stop_name || nextStop?.name || "Waiting for live trip progress"}
                </div>
                </div>
            </div>
          )}

          {/* ── TRIP SUMMARY CARD ── */}
          <div className="cpb-light-card" style={{ borderRadius: 16, padding: "14px 16px", marginBottom: 12, position: "relative", overflow: "hidden" }}>
            <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg,#1d4ed8,#0ea5e9)" }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ background: "#dbeafe", border: "1px solid #93c5fd", color: "#1e3a8a", borderRadius: 999, fontSize: 11, fontWeight: 800, padding: "3px 10px" }}>
                Bus {timeline.bus_number}
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#334155", borderRadius: 999, fontSize: 11, fontWeight: 600, padding: "3px 10px" }}>
                {timeline.route_name || timeline.route || `${timeline.start_point} -> ${timeline.end_point}`}
              </div>
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "3px 10px" }}>
                {timeline.driver_name || timeline.driver}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div style={{ background: "#f8fbff", border: "1px solid #dbeafe", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>Speed</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", marginTop: 4, color: "#1d4ed8", fontWeight: 700 }}>{busSpeed > 0 ? `${busSpeed} km/h` : "—"}</div>
              </div>
              <div style={{ background: "#f8fbff", border: "1px solid #dbeafe", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>Progress</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", marginTop: 4, color: "#1d4ed8", fontWeight: 700 }}>{completedStops}/{stops.length} stops</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 8, width: "100%", background: "#dbeafe", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: "linear-gradient(90deg,#2563eb,#0ea5e9)", borderRadius: 999 }} />
              </div>
            </div>
          </div>

          {/* ── BUS CARD ── */}
          <div className="cpb-light-card" style={{ borderRadius: 16, overflow: "hidden", marginBottom: 2 }}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#1d4ed8" }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17h18M5 17V9a2 2 0 012-2h10a2 2 0 012 2v8M9 17v2m6-2v2M7 13h2m4 0h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, color: "#0f172a", letterSpacing: "0.02em" }}>
                  Bus {timeline.bus_number}
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>{timeline.route_name || timeline.route || `${timeline.start_point} -> ${timeline.end_point}`}</div>
                {(timeline.driver_name || timeline.driver) && (
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>Driver: {timeline.driver_name || timeline.driver}</div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", borderTop: "1px solid #dbeafe" }}>
              <div style={{ padding: "10px 16px", borderRight: "1px solid #eff6ff" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Speed</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: "#1d4ed8", marginTop: 3 }}>
                  {busSpeed > 0 ? `${busSpeed} km/h` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* ── TABS ── */}
          <div style={{ display: "flex", gap: 6, margin: "14px 0 12px" }}>
            {[
              { id: "timeline", label: "Timeline", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg> },
              { id: "map", label: "Live Map", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2C5.24 2 3 4.24 3 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor" opacity="0.8" /></svg> },
            ].map(({ id, label, icon }) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={tab !== id ? "cpb-tab-off" : undefined}
                style={{
                  height: 34, padding: "0 16px", borderRadius: 7,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 6,
                  background: tab === id ? "linear-gradient(125deg, #1d4ed8, #0284c7)" : "#f8fbff",
                  color: tab === id ? "#fff" : "#64748b",
                  border: tab === id ? "1px solid #60a5fa" : "1px solid #bfdbfe",
                  boxShadow: tab === id ? "0 10px 24px rgba(30,64,175,0.3)" : "none",
                }}>
                {icon}{label}
              </button>
            ))}
          </div>

          {/* ── TIMELINE ── */}
          {tab === "timeline" && (
            <div className="cpb-light-card" style={{ borderRadius: 16, padding: "20px 16px" }}>
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <h3 className="cpb-section-title" style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>Route Timeline</h3>
                <span style={{ fontSize: 12, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "4px 10px", fontWeight: 700 }}>
                  Stop {Math.min(currentStopIndex + 1, stops.length)} of {stops.length}
                </span>
              </div>

              <LiveBusTimeline
                stops={timelineStops}
                currentStopIndex={currentStopIndex}
                nextStopIndex={nextStopIndex}
                progress={progress}
              />
            </div>
          )}

          {/* ── MAP ── */}
          {tab === "map" && (
            <div className="cpb-light-card" style={{ borderRadius: 16, overflow: "hidden" }}>
              <div style={{ height: 480, width: "100%", position: "relative" }}>
                {!GOOGLE_MAPS_API_KEY ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, padding: "0 24px", textAlign: "center" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" strokeLinecap="round" /></svg>
                    <p style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Map unavailable: set VITE_GOOGLE_MAPS_API_KEY.</p>
                    <p style={{ fontSize: 12, color: "#94a3b8" }}>Live tracking data is still updating.</p>
                  </div>
                ) : googleMapsLoadError ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, padding: "0 24px", textAlign: "center" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" strokeLinecap="round" /></svg>
                    <p style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Google Maps failed to load. Please refresh.</p>
                  </div>
                ) : !isGoogleMapLoaded ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <div style={{ width: 32, height: 32, border: "3px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "cpb-spin 1s linear infinite" }} />
                  </div>
                ) : (
                  <GoogleMap
                    mapContainerStyle={MAP_CONTAINER_STYLE}
                    center={mapCenterLatLng || { lat: 30.7333, lng: 76.7794 }}
                    zoom={MAP_ZOOM}
                    onLoad={(map) => {
                      mapRef.current = map;
                      mapInitializedRef.current = false;
                    }}
                    onUnmount={() => {
                      mapRef.current = null;
                      mapInitializedRef.current = false;
                    }}
                    options={{
                      streetViewControl: false,
                      mapTypeControl: false,
                      fullscreenControl: false,
                      clickableIcons: false,
                    }}
                  >
                    {completedRoutePath.length > 1 && (
                      <Polyline
                        path={completedRoutePath}
                        options={{
                          strokeColor: COLOR_COMPLETED,
                          strokeWeight: 5,
                          strokeOpacity: 0.85,
                        }}
                      />
                    )}

                    {upcomingRoutePath.length > 1 && (
                      <Polyline
                        path={upcomingRoutePath}
                        options={{
                          strokeColor: COLOR_UPCOMING,
                          strokeWeight: 5,
                          strokeOpacity: 0.85,
                          icons: [{
                            icon: {
                              path: "M 0,-1 0,1",
                              strokeOpacity: 1,
                              scale: 4,
                            },
                            offset: "0",
                            repeat: "14px",
                          }],
                        }}
                      />
                    )}

                    {(timeline.stops || []).map((stop) => {
                      const stopPosition = toGoogleLatLng(
                        Number(stop.stop_lat ?? stop.latitude),
                        Number(stop.stop_lng ?? stop.longitude)
                      );
                      if (!stopPosition) return null;
                      const stopId = stop.stop_id ?? stop.id;
                      return (
                        <Marker
                          key={String(stopId)}
                          position={stopPosition}
                          icon={getStopMarkerIcon(stop.state ?? stop.status) || undefined}
                          onClick={() => setSelectedMapInfo({ type: "stop", stopId })}
                        />
                      );
                    })}

                    {busPositionLatLng && (
                      <Marker
                        position={busPositionLatLng}
                        icon={getBusMarkerIcon() || undefined}
                        zIndex={1000}
                        onClick={() => setSelectedMapInfo({ type: "bus" })}
                      />
                    )}

                    {selectedMapInfo?.type === "stop" && (() => {
                      const selectedStop = (timeline.stops || []).find(
                        (stop) => Number(stop.stop_id ?? stop.id) === Number(selectedMapInfo.stopId)
                      );
                      if (!selectedStop) return null;
                      const stopPosition = toGoogleLatLng(
                        Number(selectedStop.stop_lat ?? selectedStop.latitude),
                        Number(selectedStop.stop_lng ?? selectedStop.longitude)
                      );
                      if (!stopPosition) return null;
                      return (
                        <InfoWindow position={stopPosition} onCloseClick={() => setSelectedMapInfo(null)}>
                          <div style={{ fontFamily: "'DM Sans', sans-serif", minWidth: 120 }}>
                            <p style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{selectedStop.stop_name}</p>
                            <p style={{ fontSize: 11, color: getStatus(selectedStop.state ?? selectedStop.status).labelColor, marginTop: 2, fontWeight: 500 }}>
                              {getStatus(selectedStop.state ?? selectedStop.status).label || "pending"}
                            </p>
                          </div>
                        </InfoWindow>
                      );
                    })()}

                    {selectedMapInfo?.type === "bus" && busPositionLatLng && (
                      <InfoWindow position={busPositionLatLng} onCloseClick={() => setSelectedMapInfo(null)}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", minWidth: 130 }}>
                          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                            Bus {timeline.bus_number}
                          </p>
                          <p style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                            Speed:{" "}
                            <strong style={{ color: "#1d4ed8", fontFamily: "'JetBrains Mono', monospace" }}>
                              {busSpeed} km/h
                            </strong>
                          </p>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                )}
              </div>

              {/* Map footer — legend */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#64748b" }}>
                    <div style={{ width: 20, height: 4, background: COLOR_COMPLETED, borderRadius: 2 }} />
                    Completed
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#64748b" }}>
                    <div style={{ width: 20, height: 0, borderTop: `3px dashed ${COLOR_UPCOMING}` }} />
                    Upcoming
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#64748b" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#1d4ed8" }} />
                    Approaching
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#64748b" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#94a3b8" }} />
                    Departed
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#16a34a", fontWeight: 500 }}>
                  <span className="cpb-live" style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                  updating live
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
