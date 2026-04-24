import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import api from "../../api/api";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { RefreshCw, AlertCircle } from "lucide-react";
import L from "leaflet";
import { ensureDefaultLeafletIcons } from "../../utils/leafletIcons";
import { toLeafletPolylinePositions } from "../../utils/mapGeometry";
import useLiveBusTracking from "../../hooks/useLiveBusTracking";

ensureDefaultLeafletIcons();

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const busIcon = (busNumber) => L.divIcon({
  html: `<div style="background:#2563eb;color:white;padding:4px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">🚌 ${busNumber}</div>`,
  className: "", iconAnchor: [30, 20]
});

function MapAutoResize() {
  const map = useMap();

  useEffect(() => {
    // Force Leaflet to recompute dimensions after layout settles.
    const t1 = setTimeout(() => map.invalidateSize(), 0);
    const t2 = setTimeout(() => map.invalidateSize(), 250);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);

  return null;
}

export default function LiveMapPage() {
  const [activeBuses, setActiveBuses] = useState([]);
  const [routeGeometryByRouteId, setRouteGeometryByRouteId] = useState({});
  const fetchedRouteIdsRef = useRef(new Set());
  const iconCacheRef = useRef({});
  const fetchInFlightRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tabActive, setTabActive] = useState("map");
  const [tileUrl, setTileUrl] = useState("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");

  const pollLocations = useCallback(async () => {
    const res = await api.get("/location/all");
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const { positionsByBusId, smoothedPositionsByBusId } = useLiveBusTracking({
    socketUrl: SOCKET_URL,
    socketEnabled: true,
    joinBusIds: activeBuses.map(b => Number(b.bus_id)).filter(id => Number.isFinite(id) && id > 0),
    pollEnabled: true,
    pollIntervalMs: 15000,
    pollFetcher: pollLocations,
  });

  const getBusIcon = useCallback((busNumber) => {
    const key = String(busNumber ?? "-");
    if (!iconCacheRef.current[key]) {
      iconCacheRef.current[key] = busIcon(key);
    }
    return iconCacheRef.current[key];
  }, []);

  const hasValidCoords = (latValue, lngValue) => {
    if (latValue == null || lngValue == null) return false;
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  };

  const fetchActiveBuses = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

    try {
      setLoadError("");
      const activeRes = await api.get("/admin/buses/active");

      const activeRows = Array.isArray(activeRes.data?.buses) ? activeRes.data.buses : [];
      setActiveBuses(activeRows);
    } catch (err) { console.error("Failed to load fleet data:", err);
      setLoadError("Could not load live fleet data. Please refresh.");
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const onTileError = useCallback(() => {
    setTileUrl((prev) =>
      prev.includes("openstreetmap")
        ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        : prev
    );
  }, []);

  const mapBuses = useMemo(
    () =>
      activeBuses
        .map((bus) => {
          const busId = Number(bus.bus_id);
          const smooth = smoothedPositionsByBusId[busId];
          const raw = positionsByBusId[busId];

          const lat = Array.isArray(smooth) ? smooth[0] : Number(raw?.latitude ?? bus.latitude);
          const lng = Array.isArray(smooth) ? smooth[1] : Number(raw?.longitude ?? bus.longitude);

          if (!hasValidCoords(lat, lng)) return null;

          return {
            ...bus,
            latitude: lat,
            longitude: lng,
            speed: raw?.speed ?? bus.speed,
            location_updated_at: raw?.updated_at ?? bus.location_updated_at,
          };
        })
        .filter(Boolean),
    [activeBuses, positionsByBusId, smoothedPositionsByBusId]
  );

  const activeBusesWithoutGps = useMemo(
    () =>
      activeBuses.filter((bus) => {
        const busId = Number(bus.bus_id);
        const smooth = smoothedPositionsByBusId[busId];
        const raw = positionsByBusId[busId];
        const lat = Array.isArray(smooth) ? smooth[0] : Number(raw?.latitude ?? bus.latitude);
        const lng = Array.isArray(smooth) ? smooth[1] : Number(raw?.longitude ?? bus.longitude);
        return !hasValidCoords(lat, lng);
      }),
    [activeBuses, positionsByBusId, smoothedPositionsByBusId]
  );

  useEffect(() => {
    fetchActiveBuses();
    const interval = setInterval(() => {
      fetchActiveBuses();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchActiveBuses]);

  useEffect(() => {
    const routeIds = Array.from(
      new Set(
        mapBuses
          .map((bus) => Number(bus.route_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const missingRouteIds = routeIds.filter(
      (id) => !fetchedRouteIdsRef.current.has(id)
    );
    if (missingRouteIds.length === 0) return;

    missingRouteIds.forEach((id) => fetchedRouteIdsRef.current.add(id));

    Promise.all(
      missingRouteIds.map(async (routeId) => {
        try {
          const res = await api.get(`/routes/${routeId}/geometry`);
          return [routeId, toLeafletPolylinePositions(res.data?.geometry?.coordinates)];
        } catch (err) {
          console.error(err);
          fetchedRouteIdsRef.current.delete(routeId);
          return [routeId, []];
        }
      })
    ).then((results) => {
      setRouteGeometryByRouteId((prev) => {
        const next = { ...prev };
        results.forEach(([id, geo]) => {
          next[id] = geo;
        });
        return next;
      });
    });
  }, [mapBuses]);

  const defaultCenter = mapBuses.length > 0
    ? [Number(mapBuses[0].latitude), Number(mapBuses[0].longitude)]
    : [30.9010, 75.8573];

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Live Fleet Map</h1>
          <p className="text-slate-500 text-sm">
            {activeBuses.length} active trip{activeBuses.length !== 1 ? "s" : ""} • 
            {mapBuses.length} bus{mapBuses.length !== 1 ? "es" : ""} with GPS on map • 
            {activeBusesWithoutGps.length} waiting for first GPS ping • Auto-refreshes every 10s
          </p>
          {loadError && <p className="text-sm text-red-600 mt-1">{loadError}</p>}
        </div>
        <button onClick={fetchActiveBuses} disabled={loading}
          className="flex items-center gap-2 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh
        </button>
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTabActive("map")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tabActive === "map" 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-slate-600 hover:text-slate-800"
          }`}
        >
          Map View
        </button>
        <button
          onClick={() => setTabActive("active")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tabActive === "active" 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-slate-600 hover:text-slate-800"
          }`}
        >
          Active Trips ({activeBuses.length})
        </button>
      </div>

      {/* ── MAP ── */}
      {tabActive === "map" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" style={{ height: "65vh" }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mapBuses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <AlertCircle size={48} className="text-amber-400 mb-2" />
              <p className="text-slate-600 font-medium">No active bus has sent GPS yet</p>
              <p className="text-slate-500 text-sm mt-1">
                {activeBuses.length > 0
                  ? `${activeBuses.length} active trip${activeBuses.length !== 1 ? "s" : ""} running, waiting for first location update`
                  : "No active trips right now"}
              </p>
            </div>
          ) : (
            <MapContainer center={defaultCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
              <MapAutoResize />
              <TileLayer
                url={tileUrl}
                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                eventHandlers={{
                  tileerror: onTileError,
                }}
              />
              {Object.entries(routeGeometryByRouteId).map(([routeId, positions]) => (
                Array.isArray(positions) && positions.length > 1 ? (
                  <Polyline key={`route-${routeId}`} positions={positions} color="#22c55e" weight={3} opacity={0.55} />
                ) : null
              ))}
              {mapBuses.map((bus) => (
                <Marker key={bus.bus_id} position={[Number(bus.latitude), Number(bus.longitude)]} icon={getBusIcon(bus.bus_number)}>
                  <Popup>
                    <div className="text-sm">
                    <p className="font-bold text-base mb-1">🚌 {bus.bus_number}</p>
                    <p className="text-slate-600">{bus.route_name || "No route"}</p>
                    <p className="text-slate-500">Driver: {bus.driver_name || "Unassigned"}</p>
                    <p className="text-slate-500">Speed: {Math.round(Number(bus.speed))} km/h</p>
                    <p className="text-xs text-slate-400 mt-1">Updated: {bus.location_updated_at ? new Date(bus.location_updated_at).toLocaleTimeString() : "—"}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
      )}

      {tabActive === "map" && mapBuses.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-2xl mb-2">🚌</p>
          <p className="text-slate-500">No map markers yet</p>
          <p className="text-xs text-slate-400 mt-1">Active trips without GPS are shown below and in Active Trips tab</p>
        </div>
      )}

      {tabActive === "map" && activeBusesWithoutGps.length > 0 && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Active Trips Waiting For GPS</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b text-slate-500 text-xs">
                  <th className="py-2">Bus</th>
                  <th className="py-2">Route</th>
                  <th className="py-2">Driver</th>
                  <th className="py-2">Started</th>
                  <th className="py-2">GPS</th>
                </tr>
              </thead>
              <tbody>
                {activeBusesWithoutGps.map((trip) => (
                  <tr key={trip.trip_id ?? trip.bus_id} className="border-b hover:bg-slate-50">
                    <td className="py-2 font-medium">{trip.bus_number || "-"}</td>
                    <td className="py-2 text-slate-600">{trip.route_name || "-"}</td>
                    <td className="py-2 text-slate-600">{trip.driver_name || "-"}</td>
                    <td className="py-2 text-slate-600">{trip.started_at ? new Date(trip.started_at).toLocaleTimeString() : "-"}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                        No GPS yet
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BUS TABLE */}
      {tabActive === "map" && mapBuses.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Active Buses on Map</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b text-slate-500 text-xs">
                  <th className="py-2">Bus</th>
                  <th className="py-2">Route</th>
                  <th className="py-2">Driver</th>
                  <th className="py-2">Speed</th>
                  <th className="py-2">Last Update</th>
                </tr>
              </thead>
              <tbody>
                {mapBuses.map((b) => (
                  <tr key={b.bus_id} className="border-b hover:bg-slate-50">
                    <td className="py-2 font-medium">{b.bus_number}</td>
                    <td className="py-2 text-slate-600">{b.route_name || "—"}</td>
                    <td className="py-2 text-slate-600">{b.driver_name || "—"}</td>
                    <td className="py-2">{Math.round(Number(b.speed))} km/h</td>
                    <td className="py-2 text-slate-400 text-xs">{b.location_updated_at ? new Date(b.location_updated_at).toLocaleTimeString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ACTIVE TRIPS TABLE */}
      {tabActive === "active" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Currently Active Trips</h3>
          {activeBuses.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              No active trips right now.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b text-slate-500 text-xs">
                    <th className="py-2">Bus</th>
                    <th className="py-2">Route</th>
                    <th className="py-2">Driver</th>
                    <th className="py-2">Started</th>
                    <th className="py-2">Location</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBuses.map((trip) => (
                    <tr key={trip.trip_id} className="border-b hover:bg-slate-50">
                      <td className="py-2 font-medium">{trip.bus_number}</td>
                      <td className="py-2 text-slate-600">{trip.route_name || "-"}</td>
                      <td className="py-2 text-slate-600">{trip.driver_name || "-"}</td>
                      <td className="py-2 text-slate-600">{trip.started_at ? new Date(trip.started_at).toLocaleTimeString() : "-"}</td>
                      <td className="py-2 text-slate-600">{trip.latitude != null && trip.longitude != null ? `${trip.latitude.toFixed(5)}, ${trip.longitude.toFixed(5)}` : "No GPS yet"}</td>
                      <td className="py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${trip.is_stale ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {trip.is_stale ? "Stale" : "Live"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
