import { useState, useEffect, useContext } from "react";
import api from "../../api/api";
import { ToastContext } from "../../context/ToastContext";
import { Map, PlusCircle, X, Trash2 } from "lucide-react";

export default function RoutesPage() {
  const { showToast } = useContext(ToastContext) ?? {};

  const [routeName, setRouteName] = useState("");
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedStopIds, setSelectedStopIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const fetchRoutes = async () => {
    try {
      const res = await api.get("/routes");
      setRoutes(Array.isArray(res.data?.data) ? res.data.data : []);
      setError("");
    } catch (err) {
      setRoutes([]);
      setError(err.response?.data?.message || "Failed to load routes");
    }
  };

  const fetchStops = async () => {
    try {
      const res = await api.get("/stops");
      setStops(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) { console.error("Failed to load stops:", err); setStops([]); }
  };

  useEffect(() => { fetchRoutes(); fetchStops(); }, []);

  const addRoute = async () => {
    const name = routeName?.trim();
    if (!name) { alert("Please enter a route name"); return; }
    if (selectedStopIds.length < 2) { alert("Please add at least 2 stops in order"); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/routes", { route_name: name, stops: selectedStopIds });
      setRouteName(""); setSelectedStopIds([]);
      await fetchRoutes();
      showToast?.("Route created successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to add route";
      setError(msg); showToast?.(msg, "error");
    } finally { setLoading(false); }
  };

  const deleteRoute = async (id, name) => {
    if (!confirm(`Delete route "${name}"?`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/routes/${id}`);
      await fetchRoutes();
      showToast?.("Route deleted successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to delete route";
      setError(msg); showToast?.(msg, "error");
    } finally { setDeletingId(null); }
  };

  const addStopToRoute = (stopId) => {
    const id = typeof stopId === "string" ? parseInt(stopId, 10) : stopId;
    if (id && !selectedStopIds.includes(id)) setSelectedStopIds((prev) => [...prev, id]);
  };

  const removeStopFromRoute = (index) => setSelectedStopIds((prev) => prev.filter((_, i) => i !== index));
  const getStopName = (id) => stops.find((s) => s.id === id)?.stop_name || `Stop #${id}`;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Routes Management</h1>
        <p className="text-slate-500">Create routes by selecting stops in order (min 2 stops)</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><PlusCircle size={20} />Add New Route</h2>
          <div className="mb-3">
            <label className="text-sm text-slate-600">Route Name</label>
            <input className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. City Center - Airport" value={routeName} onChange={(e) => setRouteName(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="text-sm text-slate-600">Stops (in order)</label>
            <select className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" value="" onChange={(e) => { addStopToRoute(e.target.value); e.target.value = ""; }}>
              <option value="">Add a stop...</option>
              {stops.filter((s) => !selectedStopIds.includes(s.id)).map((s) => (
                <option key={s.id} value={s.id}>{s.stop_name}</option>
              ))}
            </select>
            <ul className="mt-2 space-y-1">
              {selectedStopIds.map((id, index) => (
                <li key={`${id}-${index}`} className="flex items-center justify-between text-sm bg-slate-50 rounded px-2 py-1">
                  <span>{index + 1}. {getStopName(id)}</span>
                  <button type="button" onClick={() => removeStopFromRoute(index)} className="text-red-500 hover:text-red-700"><X size={14} /></button>
                </li>
              ))}
            </ul>
            {selectedStopIds.length === 1 && <p className="text-xs text-amber-600 mt-1">Add at least one more stop</p>}
          </div>
          <button onClick={addRoute} disabled={loading || selectedStopIds.length < 2} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Map size={18} />{loading ? "Creating..." : "Add Route"}
          </button>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Existing Routes</h2>
          {routes.length === 0 ? (
            <p className="text-center text-slate-500 py-6">No routes found</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-slate-500 text-sm">
                  <th className="py-2">Route Name</th>
                  <th className="py-2">From → To</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-slate-50 transition">
                    <td className="py-2 font-medium">{r.route_name}</td>
                    <td className="py-2 text-sm text-slate-500">{r.start_point} → {r.end_point}</td>
                    <td className="py-2">
                      <button onClick={() => deleteRoute(r.id, r.route_name)} disabled={deletingId === r.id} className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm disabled:opacity-50">
                        <Trash2 size={15} />{deletingId === r.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
