import { useState, useEffect, useContext } from "react";
import api from "../../api/api";
import { ToastContext } from "../../context/ToastContext";
import { Bus, Route, PlusCircle, Trash2 } from "lucide-react";

export default function BusesPage() {
  const { showToast } = useContext(ToastContext) ?? {};

  const [busNumber, setBusNumber] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const fetchBuses = async () => {
    try {
      const res = await api.get("/buses");
      setBuses(Array.isArray(res.data?.data) ? res.data.data : []);
      setError("");
    } catch (err) {
      setBuses([]);
      setError(err.response?.data?.message || "Failed to load buses");
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await api.get("/routes");
      setRoutes(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) { console.error("Failed to load routes:", err);
      setRoutes([]);
    }
  };

  useEffect(() => { fetchBuses(); fetchRoutes(); }, []);

  const addBus = async () => {
    if (!busNumber?.trim() || !selectedRoute) { alert("Please fill all fields"); return; }
    setLoading(true);
    try {
      await api.post("/buses", { bus_number: busNumber.trim(), route_id: selectedRoute });
      setBusNumber(""); setSelectedRoute("");
      await fetchBuses();
      showToast?.("Bus added successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to add bus";
      setError(msg); showToast?.(msg, "error");
    } finally { setLoading(false); }
  };

  const deleteBus = async (id, number) => {
    if (!confirm(`Delete bus ${number}?`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/buses/${id}`);
      await fetchBuses();
      showToast?.("Bus deleted successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to delete bus";
      setError(msg); showToast?.(msg, "error");
    } finally { setDeletingId(null); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Buses Management</h1>
        <p className="text-slate-500">Add and manage buses in the system</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><PlusCircle size={20} />Add New Bus</h2>
          <div className="mb-4">
            <label className="text-sm text-slate-600">Bus Number</label>
            <input className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="KL-01-1234" value={busNumber} onChange={(e) => setBusNumber(e.target.value)} />
          </div>
          <div className="mb-6">
            <label className="text-sm text-slate-600">Assign Route</label>
            <div className="relative mt-1">
              <Route className="absolute left-3 top-3 text-slate-400" size={18} />
              <select className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}>
                <option value="">Select Route</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.route_name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addBus} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            <Bus size={18} />{loading ? "Adding..." : "Add Bus"}
          </button>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Existing Buses</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-slate-500 text-sm">
                  <th className="py-2">Bus Number</th>
                  <th className="py-2">Route</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {buses.map((b) => (
                  <tr key={b.id} className="border-b hover:bg-slate-50 transition">
                    <td className="py-2 font-medium">{b.bus_number}</td>
                    <td className="py-2">{b.route_name || "No route"}</td>
                    <td className="py-2">
                      <button onClick={() => deleteBus(b.id, b.bus_number)} disabled={deletingId === b.id} className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm disabled:opacity-50">
                        <Trash2 size={15} />{deletingId === b.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {buses.length === 0 && <p className="text-center text-slate-500 py-6">No buses found</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
