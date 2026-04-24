import { useState, useEffect, useContext } from "react";
import api from "../../api/api";
import { ToastContext } from "../../context/ToastContext";
import { MapPin, PlusCircle, Navigation, Trash2 } from "lucide-react";

export default function StopsPage() {
  const { showToast } = useContext(ToastContext) ?? {};

  const [stopName, setStopName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const fetchStops = async () => {
    try {
      const res = await api.get("/stops");
      setStops(Array.isArray(res.data?.data) ? res.data.data : []);
      setError("");
    } catch (err) {
      setStops([]);
      setError(err.response?.data?.message || "Failed to load stops");
    }
  };

  useEffect(() => { fetchStops(); }, []);

  const addStop = async () => {
    const name = stopName?.trim();
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (!name) { alert("Please enter stop name"); return; }
    if (lat === "" || lng === "" || isNaN(latitude) || isNaN(longitude)) { alert("Please enter valid latitude and longitude"); return; }
    if (latitude < -90 || latitude > 90) { alert("Latitude must be between -90 and 90"); return; }
    if (longitude < -180 || longitude > 180) { alert("Longitude must be between -180 and 180"); return; }

    setLoading(true);
    setError("");
    try {
      await api.post("/stops", { stop_name: name, latitude, longitude });
      setStopName(""); setLat(""); setLng("");
      await fetchStops();
      showToast?.("Stop added successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to add stop";
      setError(msg); showToast?.(msg, "error");
    } finally { setLoading(false); }
  };

  const deleteStop = async (id, name) => {
    if (!confirm(`Delete stop "${name}"?`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/stops/${id}`);
      await fetchStops();
      showToast?.("Stop deleted successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to delete stop";
      setError(msg); showToast?.(msg, "error");
    } finally { setDeletingId(null); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Stops Management</h1>
        <p className="text-slate-500">Add and manage bus stops</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><PlusCircle size={20} />Add New Stop</h2>
          <div className="mb-4">
            <label className="text-sm text-slate-600">Stop Name</label>
            <input className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Main Bus Stand" value={stopName} onChange={(e) => setStopName(e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="text-sm text-slate-600">Latitude</label>
            <div className="relative mt-1">
              <Navigation className="absolute left-3 top-3 text-slate-400" size={18} />
              <input className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="12.9716" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
          </div>
          <div className="mb-6">
            <label className="text-sm text-slate-600">Longitude</label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
              <input className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="77.5946" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          <button onClick={addStop} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            <MapPin size={18} />{loading ? "Adding..." : "Add Stop"}
          </button>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Existing Stops</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-slate-500 text-sm">
                  <th className="py-2">Stop Name</th>
                  <th className="py-2">Latitude</th>
                  <th className="py-2">Longitude</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-slate-50 transition">
                    <td className="py-2 font-medium">{s.stop_name}</td>
                    <td className="py-2 text-sm text-slate-500">{s.latitude}</td>
                    <td className="py-2 text-sm text-slate-500">{s.longitude}</td>
                    <td className="py-2">
                      <button onClick={() => deleteStop(s.id, s.stop_name)} disabled={deletingId === s.id} className="flex items-center gap-1 text-red-500 hover:text-red-700 text-sm disabled:opacity-50">
                        <Trash2 size={15} />{deletingId === s.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stops.length === 0 && <p className="text-center text-slate-500 py-6">No stops found</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
