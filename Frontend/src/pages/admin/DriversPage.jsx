import { useState, useEffect, useContext } from "react";
import api from "../../api/api";
import { ToastContext } from "../../context/ToastContext";
import { UserPlus, Users, Mail, Lock, CreditCard, Phone } from "lucide-react";

export default function DriversPage() {
  const { showToast } = useContext(ToastContext) ?? {};

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phone, setPhone] = useState("");

  const [drivers, setDrivers] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* ================= FETCH DRIVERS ================= */
  const fetchDrivers = async () => {
    try {
      const res = await api.get("/admin/drivers");
      const data = res.data;
      if (Array.isArray(data)) setDrivers(data);
      else if (Array.isArray(data?.data)) setDrivers(data.data);
      else if (Array.isArray(data?.drivers)) setDrivers(data.drivers);
      else setDrivers([]);
      setError("");
    } catch (err) {
      setDrivers([]);
      setError(err.response?.data?.message || "Failed to load drivers");
    }
  };

  /* ================= FETCH BUSES ================= */
  const fetchBuses = async () => {
    try {
      const res = await api.get("/buses");
      const data = res.data;
      if (Array.isArray(data)) setBuses(data);
      else if (Array.isArray(data?.data)) setBuses(data.data);
      else if (Array.isArray(data?.buses)) setBuses(data.buses);
      else setBuses([]);
    } catch (err) { console.error("Failed to load buses:", err);
      setBuses([]);
    }
  };

  useEffect(() => {
    fetchDrivers();
    fetchBuses();
  }, []);

  /* ================= ADD DRIVER (admin create-driver) ================= */
  const addDriver = async () => {
    if (!name?.trim() || !email?.trim() || !password || !licenseNumber?.trim() || !phone?.trim()) {
      alert("Please fill all fields (name, email, password, license number, phone)");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await api.post("/admin/create-driver", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        license_number: licenseNumber.trim(),
        phone: phone.trim(),
      });

      setName("");
      setEmail("");
      setPassword("");
      setLicenseNumber("");
      setPhone("");
      await fetchDrivers();
      showToast?.("Driver added successfully", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to add driver";
      setError(msg);
      showToast?.(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  /* ================= HELPERS ================= */

  const getAssignedBus = (driverId) => {
    const bus = buses.find((b) => Number(b.driver_id) === Number(driverId));
    return bus ? bus.bus_number : "Not assigned";
  };

  /* ================= UI ================= */

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Drivers Management
        </h1>
        <p className="text-slate-500">
          Add and manage drivers
        </p>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ADD DRIVER */}
        <div className="bg-white rounded-xl shadow-sm p-6">

          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <UserPlus size={20} />
            Add New Driver
          </h2>

          {/* NAME */}
          <div className="mb-4">
            <label className="text-sm text-slate-600">Name</label>
            <input
              className="w-full mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Driver name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* EMAIL */}
          <div className="mb-4">
            <label className="text-sm text-slate-600">Email</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="driver@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* PASSWORD */}
          <div className="mb-4">
            <label className="text-sm text-slate-600">Password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="password"
                className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* LICENSE NUMBER */}
          <div className="mb-4">
            <label className="text-sm text-slate-600">License Number</label>
            <div className="relative mt-1">
              <CreditCard className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="KL14-2023-XXXXXX"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          {/* PHONE */}
          <div className="mb-6">
            <label className="text-sm text-slate-600">Phone</label>
            <div className="relative mt-1">
              <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="tel"
                className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* BUTTON */}
          <button
            onClick={addDriver}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Users size={18} />
            {loading ? "Adding..." : "Add Driver"}
          </button>

        </div>

        {/* DRIVER LIST */}
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-6">

          <h2 className="text-lg font-semibold mb-4">
            Existing Drivers
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-slate-500 text-sm">
                  <th className="py-2">Name</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">License</th>
                  <th className="py-2">Assigned Bus</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} className="border-b hover:bg-slate-50 transition">
                    <td className="py-2 font-medium">{d.name}</td>
                    <td className="py-2">{d.email}</td>
                    <td className="py-2">{d.license_number || "N/A"}</td>
                    <td className="py-2">{getAssignedBus(d.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {drivers.length === 0 && (
              <p className="text-center text-slate-500 py-6">
                No drivers found
              </p>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}