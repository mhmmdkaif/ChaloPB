import { useEffect, useMemo, useState } from "react";
import api from "../../../api/api";
import { Plus } from "lucide-react";

export default function StopSearch({ routeStops, setRouteStops }) {
  const [stops, setStops] = useState([]);
  const [searchStop, setSearchStop] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStops();
  }, []);

  const fetchStops = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/stops");
      // backend returns { data: [...] }
      setStops(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load stops.");
    } finally {
      setLoading(false);
    }
  };

  const addStop = (stop) => {
    if (routeStops.find((s) => s.id === stop.id)) return;
    setRouteStops((prev) => [...prev, { id: stop.id, stop_name: stop.stop_name }]);
    setSearchStop("");
  };

  const filteredStops = useMemo(() => {
    const q = searchStop.trim().toLowerCase();
    if (!q) return [];
    return stops.filter((s) => s.stop_name.toLowerCase().includes(q)).slice(0, 30);
  }, [stops, searchStop]);

  return (
    <div className="space-y-2">
      <input
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/70"
        placeholder="Search by stop name..."
        value={searchStop}
        onChange={(e) => setSearchStop(e.target.value)}
      />
      {loading && <p className="mt-2 text-sm text-slate-500">Loading stops...</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {searchStop && (
        <div className="border mt-1 rounded-lg max-h-48 overflow-y-auto bg-white shadow-sm">
          {filteredStops.map((s) => (
            <div key={s.id} onClick={() => addStop(s)} className="p-2 hover:bg-slate-100 cursor-pointer flex items-center gap-2 text-sm">
              <Plus size={14} />{s.stop_name}
            </div>
          ))}
          {filteredStops.length === 0 && <p className="p-2 text-xs text-slate-500">No stops found</p>}
        </div>
      )}
      {!searchStop && stops.length > 0 && (
        <p className="text-[11px] text-slate-400">Hint: start typing to search stops.</p>
      )}
    </div>
  );
}
