import { useState, useEffect, useContext } from "react";
import api from "../../api/api";
import { ToastContext } from "../../context/ToastContext";
import { Bus, Users, Link, Unlink } from "lucide-react";

export default function AssignBusPage() {
  const { showToast } = useContext(ToastContext) ?? {};

  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedBus, setSelectedBus] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [unassignBus, setUnassignBus] = useState("");
  const [loading, setLoading] = useState(false);
  const [unassignLoading, setUnassignLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");

  const fetchBuses = async () => {
    try {
      const res = await api.get("/buses");
      setBuses(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setFetchError("Failed to load buses: " + (err.response?.data?.message || err.message));
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await api.get("/admin/drivers");
      // backend wraps in { data: [...] }
      const list = Array.isArray(res.data?.data) ? res.data.data
        : Array.isArray(res.data) ? res.data : [];
      setDrivers(list);
    } catch (err) {
      setFetchError("Failed to load drivers: " + (err.response?.data?.message || err.message));
    }
  };

  useEffect(() => { fetchBuses(); fetchDrivers(); }, []);

  // Drivers already assigned to a bus (by drivers.id)
  const assignedDriverIds = buses
    .filter(b => b.driver_id != null)
    .map(b => Number(b.driver_id));

  // Only show unassigned drivers in the dropdown
  const availableDrivers = drivers.filter(d => !assignedDriverIds.includes(Number(d.id)));

  const assignDriver = async () => {
    if (!selectedBus || !selectedDriver) {
      alert("Please select both a bus and a driver");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/drivers/assign", {
        bus_id: parseInt(selectedBus, 10),
        driver_id: parseInt(selectedDriver, 10),
      });
      setSelectedBus("");
      setSelectedDriver("");
      await fetchBuses();
      await fetchDrivers();
      showToast?.("Driver assigned successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Assignment failed";
      setError(msg);
      showToast?.(msg, "error");
    } finally { setLoading(false); }
  };

  const handleUnassign = async () => {
    if (!unassignBus) { alert("Please select a bus to unassign"); return; }
    setUnassignLoading(true);
    setError("");
    try {
      await api.post("/drivers/unassign", { bus_id: parseInt(unassignBus, 10) });
      setUnassignBus("");
      await fetchBuses();
      await fetchDrivers();
      showToast?.("Driver unassigned successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Unassignment failed";
      setError(msg);
      showToast?.(msg, "error");
    } finally { setUnassignLoading(false); }
  };

  const unassignedBuses = buses.filter(b => !b.driver_id);
  const assignedBuses = buses.filter(b => b.driver_id);

  const getDriverName = (driverId) => {
    const d = drivers.find(d => Number(d.id) === Number(driverId));
    return d ? d.name : `Driver #${driverId}`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Assign Bus</h1>
        <p className="text-slate-500">Assign or unassign drivers to buses</p>
        {fetchError && <p className="mt-2 text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{fetchError}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ASSIGN */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Link size={20} />Assign Driver to Bus
          </h2>

          <div className="mb-4">
            <label className="text-sm text-slate-600">Select Bus (unassigned only)</label>
            <select
              className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedBus}
              onChange={e => setSelectedBus(e.target.value)}
            >
              <option value="">— {unassignedBuses.length} bus{unassignedBuses.length !== 1 ? "es" : ""} available —</option>
              {unassignedBuses.map(b => (
                <option key={b.id} value={b.id}>{b.bus_number} — {b.route_name || "No route"}</option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="text-sm text-slate-600">Select Driver (unassigned only)</label>
            <select
              className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedDriver}
              onChange={e => setSelectedDriver(e.target.value)}
            >
              <option value="">— {availableDrivers.length} driver{availableDrivers.length !== 1 ? "s" : ""} available —</option>
              {availableDrivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} — {d.email}</option>
              ))}
            </select>
            {availableDrivers.length === 0 && drivers.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">All drivers are already assigned to buses</p>
            )}
            {drivers.length === 0 && (
              <p className="text-xs text-red-500 mt-1">No drivers found — create drivers first</p>
            )}
          </div>

          <button
            onClick={assignDriver}
            disabled={loading || !selectedBus || !selectedDriver}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Users size={18} />{loading ? "Assigning..." : "Assign Driver"}
          </button>
        </div>

        {/* UNASSIGN */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Unlink size={20} />Unassign Driver from Bus
          </h2>

          <div className="mb-6">
            <label className="text-sm text-slate-600">Select Bus (assigned only)</label>
            <select
              className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={unassignBus}
              onChange={e => setUnassignBus(e.target.value)}
            >
              <option value="">— {assignedBuses.length} bus{assignedBuses.length !== 1 ? "es" : ""} assigned —</option>
              {assignedBuses.map(b => (
                <option key={b.id} value={b.id}>{b.bus_number} — {getDriverName(b.driver_id)}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleUnassign}
            disabled={unassignLoading || !unassignBus}
            className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Unlink size={18} />{unassignLoading ? "Unassigning..." : "Unassign Driver"}
          </button>
        </div>

      </div>

      {/* ASSIGNMENTS TABLE */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Current Assignments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b text-slate-500 text-sm">
                <th className="py-2">Bus</th>
                <th className="py-2">Route</th>
                <th className="py-2">Driver</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {buses.map(b => (
                <tr key={b.id} className="border-b hover:bg-slate-50 transition">
                  <td className="py-2 font-medium"><Bus size={14} className="inline mr-1" />{b.bus_number}</td>
                  <td className="py-2 text-sm">{b.route_name || "No route"}</td>
                  <td className="py-2 text-sm">{b.driver_id ? getDriverName(b.driver_id) : "—"}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.driver_id ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {b.driver_id ? "Assigned" : "Unassigned"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {buses.length === 0 && <p className="text-center text-slate-500 py-6">No buses found</p>}
        </div>
      </div>
    </div>
  );
}