import { useCallback, useEffect, useMemo, useState, useContext } from "react";
import api from "../../../api/api";
import { ToastContext } from "../../../context/ToastContext";

import StopSearch from "./StopSearch";
import Timeline from "./Timeline";

export default function RouteForm({ selectedRoute }) {
  const { showToast } = useContext(ToastContext) ?? {};

  const [routeStops, setRouteStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* ================= LOAD ROUTE STOPS ================= */

  const fetchRouteStops = useCallback(async (routeId) => {
    if (!routeId) return;
    try {
      setLoading(true);
      setError("");
      const res = await api.get(`/routes/${routeId}/stops`);
      setRouteStops(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load route stops.");
      setRouteStops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRoute?.id) {
      fetchRouteStops(selectedRoute.id);
    } else {
      setRouteStops([]);
      setError("");
    }
  }, [selectedRoute?.id, fetchRouteStops]);

  const displayStart = useMemo(() => {
    if (routeStops.length > 0) return routeStops[0]?.stop_name;
    return selectedRoute?.start_point || "";
  }, [routeStops, selectedRoute?.start_point]);

  const displayEnd = useMemo(() => {
    if (routeStops.length > 1) return routeStops[routeStops.length - 1]?.stop_name;
    return selectedRoute?.end_point || "";
  }, [routeStops, selectedRoute?.end_point]);

  /* ================= SAVE ================= */

  const canSave = useMemo(() => routeStops.length >= 2 && !loading && !saving, [
    routeStops.length,
    loading,
    saving,
  ]);

  const saveRouteStops = async () => {
    if (!selectedRoute) return;
    if (routeStops.length < 2) {
      alert("Add at least 2 stops to save a route.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = routeStops.map((s, i) => ({
        stop_id: s.id,
        stop_order: i + 1,
      }));

      await api.post(`/routes/${selectedRoute.id}/stops`, { stops: payload });
      if (showToast) showToast("Route saved successfully", "success");
    } catch (err) {
      setError(err?.response?.data?.message || "Saving failed.");
      if (showToast) showToast("Saving failed", "error");
    } finally {
      setSaving(false);
    }
  };

  /* ================= UI ================= */

  if (!selectedRoute) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <p className="text-sm">
            Select a route from the left panel to start configuring its stop timeline.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            You&apos;ll define the ordered sequence of bus stops for this route.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="flex-1 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-4 overflow-hidden">

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {selectedRoute.route_name}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {displayStart} → {displayEnd}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Drag and arrange stops in the exact order buses will travel along this route.
          </p>
        </div>

        <div className="text-right text-xs text-slate-500">
          <p>
            Route ID: <span className="font-mono">{selectedRoute.id}</span>
          </p>
          <p>
            Total stops: <span className="font-semibold">{routeStops.length}</span>
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* BODY */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 mt-4 overflow-hidden">

        {/* LEFT: SEARCH / ADD STOP */}
        <div className="lg:w-80 lg:min-w-[18rem]">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 h-full">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              Add stops to route
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Search from the global stop list and append bus stops to this route.
            </p>

            <StopSearch
              routeStops={routeStops}
              setRouteStops={setRouteStops}
            />
          </div>
        </div>

        {/* RIGHT: TIMELINE */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 h-full overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              Ordered stop timeline
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Reorder stops via drag and drop, or use the arrow controls for precise adjustments.
            </p>

            {loading ? (
              <p className="text-slate-500 text-sm mt-4">
                Loading stops...
              </p>
            ) : (
              <Timeline
                routeStops={routeStops}
                setRouteStops={setRouteStops}
              />
            )}
          </div>
        </div>
      </div>

      {/* SAVE */}
      <div className="pt-3 mt-3 border-t flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Tip: add at least 2 stops. The order here defines how users see the route on the map and in search results.
        </p>
        <button
          onClick={saveRouteStops}
          disabled={!canSave}
          className="px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save Route Timeline"}
        </button>
      </div>

    </section>
  );
}
