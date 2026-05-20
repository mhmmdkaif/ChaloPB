import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GoogleMap, InfoWindow, Marker, Polyline } from "@react-google-maps/api";
import api from "../../api/api";
import { RefreshCw, AlertCircle } from "lucide-react";
import useLiveBusTracking from "../../hooks/useLiveBusTracking";
import { useGoogleMaps } from "../../context/GoogleMapsContext";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const DEFAULT_CENTER = { lat: 30.901, lng: 75.8573 };
const MAP_CONTAINER_STYLE = { height: "100%", width: "100%" };

function hasValidCoords(latValue, lngValue) {
  if (latValue == null || lngValue == null) return false;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function toGoogleLatLng(latValue, lngValue) {
  if (!hasValidCoords(latValue, lngValue)) return null;
  return {
    lat: Number(latValue),
    lng: Number(lngValue),
  };
}

function toGooglePolylinePath(coordinates) {
  if (!Array.isArray(coordinates)) return [];

  return coordinates
    .map((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (!hasValidCoords(lat, lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);
}

function escapeSvgText(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function LiveMapPage() {
  const [activeBuses, setActiveBuses] = useState([]);
  const [routeGeometryByRouteId, setRouteGeometryByRouteId] = useState({});
  const fetchedRouteIdsRef = useRef(new Set());
  const iconCacheRef = useRef({});
  const fetchInFlightRef = useRef(false);
  const mapRef = useRef(null);
  const hasInitializedCenterRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [tabActive, setTabActive] = useState("map");
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);

  const { isLoaded, loadError: googleMapsLoadError, apiKey: GOOGLE_MAPS_API_KEY } = useGoogleMaps();

  const pollLocations = useCallback(async () => {
    const res = await api.get("/location/all");
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const joinBusIds = useMemo(
    () => activeBuses.map((b) => Number(b.bus_id)).filter((id) => Number.isFinite(id) && id > 0),
    [activeBuses]
  );

  const { positionsByBusId, smoothedPositionsByBusId } = useLiveBusTracking({
    socketUrl: SOCKET_URL,
    socketEnabled: true,
    joinBusIds: joinBusIds,
    pollEnabled: true,
    pollIntervalMs: 15000,
    pollFetcher: pollLocations,
  });

  const getBusIcon = useCallback((busNumber) => {
    const key = String(busNumber ?? "-");
    if (!window.google?.maps) return null;

    if (!iconCacheRef.current[key]) {
      const safeLabel = escapeSvgText(key);
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="84" height="32" viewBox="0 0 84 32">
          <rect x="1.5" y="1.5" width="81" height="29" rx="14.5" fill="#2563eb" stroke="#ffffff" stroke-width="3" />
          <text x="42" y="20" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff">BUS ${safeLabel}</text>
        </svg>
      `;

      iconCacheRef.current[key] = {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
        scaledSize: new window.google.maps.Size(84, 32),
        anchor: new window.google.maps.Point(42, 16),
      };
    }

    return iconCacheRef.current[key];
  }, []);

  const fetchActiveBuses = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

    try {
      setLoadError("");
      const activeRes = await api.get("/admin/buses/active");

      const activeRows = Array.isArray(activeRes.data?.trips)
        ? activeRes.data.trips
        : (Array.isArray(activeRes.data?.buses) ? activeRes.data.buses : []);
      setActiveBuses(activeRows);
    } catch (err) {
      console.error("Failed to load fleet data:", err);
      setLoadError("Could not load live fleet data. Please refresh.");
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const mapBuses = useMemo(
    () =>
      activeBuses
        .map((bus) => {
          const busId = Number(bus.bus_id);
          const smooth = smoothedPositionsByBusId[busId];
          const raw = positionsByBusId[busId];

          const lat = Array.isArray(smooth)
            ? smooth[0]
            : Number(raw?.latitude ?? bus.bus_lat ?? bus.latitude);
          const lng = Array.isArray(smooth)
            ? smooth[1]
            : Number(raw?.longitude ?? bus.bus_lng ?? bus.longitude);

          const position = toGoogleLatLng(lat, lng);
          if (!position) return null;

          return {
            ...bus,
            latitude: position.lat,
            longitude: position.lng,
            position,
            speed: raw?.speed ?? bus.speed,
            location_updated_at: raw?.updated_at ?? bus.bus_updated_at ?? bus.location_updated_at,
            is_stale: (() => {
              const updatedAt = raw?.updated_at ?? bus.bus_updated_at ?? bus.location_updated_at;
              if (!updatedAt) return true;
              return (Date.now() - new Date(updatedAt).getTime()) / 1000 > 30;
            })(),
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
        const lat = Array.isArray(smooth)
          ? smooth[0]
          : Number(raw?.latitude ?? bus.bus_lat ?? bus.latitude);
        const lng = Array.isArray(smooth)
          ? smooth[1]
          : Number(raw?.longitude ?? bus.bus_lng ?? bus.longitude);
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
    if (!isLoaded) return;

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
          return [routeId, toGooglePolylinePath(res.data?.geometry?.coordinates)];
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
  }, [isLoaded, mapBuses]);

  useEffect(() => {
    if (mapBuses.length === 0) {
      hasInitializedCenterRef.current = false;
      setMapCenter(DEFAULT_CENTER);
      return;
    }

    if (!hasInitializedCenterRef.current) {
      hasInitializedCenterRef.current = true;
      setMapCenter(mapBuses[0].position);
    }
  }, [mapBuses]);

  useEffect(() => {
    if (!mapBuses.some((bus) => Number(bus.bus_id) === Number(selectedBusId))) {
      setSelectedBusId(null);
    }
  }, [mapBuses, selectedBusId]);

  useEffect(() => {
    if (!window.google?.maps) return undefined;

    const triggerResize = () => {
      const map = mapRef.current;
      if (!map) return;
      window.google.maps.event.trigger(map, "resize");
      map.setCenter(mapCenter);
    };

    const t1 = setTimeout(triggerResize, 0);
    const t2 = setTimeout(triggerResize, 250);
    window.addEventListener("resize", triggerResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", triggerResize);
    };
  }, [isLoaded, mapCenter]);

  const selectedBus = useMemo(
    () => mapBuses.find((bus) => Number(bus.bus_id) === Number(selectedBusId)) || null,
    [mapBuses, selectedBusId]
  );

  const mapOptions = useMemo(
    () => ({
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
    }),
    []
  );

  const mapUnavailableMessage = !GOOGLE_MAPS_API_KEY
    ? "Google Maps API key is missing. Set VITE_GOOGLE_MAPS_API_KEY to load the map."
    : (googleMapsLoadError ? "Google Maps failed to load. Please refresh." : "");

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Live Fleet Map</h1>
          <p className="text-slate-500 text-sm">
            {activeBuses.length} active trip{activeBuses.length !== 1 ? "s" : ""} •
            {" "}
            {mapBuses.length} bus{mapBuses.length !== 1 ? "es" : ""} with GPS on map •
            {" "}
            {activeBusesWithoutGps.length} waiting for first GPS ping • Auto-refreshes every 10s
          </p>
          {loadError && <p className="text-sm text-red-600 mt-1">{loadError}</p>}
        </div>
        <button
          onClick={fetchActiveBuses}
          disabled={loading}
          className="flex items-center gap-2 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

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

      {tabActive === "map" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" style={{ height: "65vh" }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mapUnavailableMessage ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <AlertCircle size={48} className="text-amber-400 mb-2" />
              <p className="text-slate-600 font-medium">{mapUnavailableMessage}</p>
              <p className="text-slate-500 text-sm mt-1">
                Fleet data is still loading and updating below.
              </p>
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
          ) : !isLoaded ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={mapCenter}
              zoom={13}
              onLoad={(map) => {
                mapRef.current = map;
              }}
              onUnmount={() => {
                mapRef.current = null;
              }}
              options={mapOptions}
            >
              {Object.entries(routeGeometryByRouteId).map(([routeId, path]) => (
                Array.isArray(path) && path.length > 1 ? (
                  <Polyline
                    key={`route-${routeId}`}
                    path={path}
                    options={{
                      strokeColor: "#22c55e",
                      strokeWeight: 3,
                      strokeOpacity: 0.55,
                    }}
                  />
                ) : null
              ))}

              {mapBuses.map((bus) => (
                <Marker
                  key={bus.bus_id}
                  position={bus.position}
                  icon={getBusIcon(bus.bus_number) || undefined}
                  onClick={() => setSelectedBusId(bus.bus_id)}
                />
              ))}

              {selectedBus && (
                <InfoWindow
                  position={selectedBus.position}
                  onCloseClick={() => setSelectedBusId(null)}
                >
                  <div className="text-sm">
                    <p className="font-bold text-base mb-1">Bus {selectedBus.bus_number}</p>
                    <p className="text-slate-600">{selectedBus.route_name || "No route"}</p>
                    <p className="text-slate-500">Driver: {selectedBus.driver_name || "Unassigned"}</p>
                    <p className="text-slate-500">Speed: {Math.round(Number(selectedBus.speed))} km/h</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Updated: {selectedBus.location_updated_at ? new Date(selectedBus.location_updated_at).toLocaleTimeString() : "—"}
                    </p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
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
                    <th className="py-2">Progress</th>
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
                      <td className="py-2 text-slate-600">
                        {Number.isFinite(Number(trip.stops_completed)) && Number.isFinite(Number(trip.stops_total))
                          ? `${trip.stops_completed}/${trip.stops_total}`
                          : "-"}
                      </td>
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
