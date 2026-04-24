import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../../context/AuthContext";
import { LayoutDashboard, Bus, Users, Route, MapPin, LogOut, Map, Link as LinkIcon, Radio } from "lucide-react";

export default function AdminLayout() {
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">B</div>
          <span className="text-base font-bold text-slate-800">ChaloPB Admin</span>
        </div>
        <p className="text-xs text-slate-400 mb-6 pl-10">Control Panel</p>

        <nav className="space-y-1">
          <NavItem to="/admin" icon={<LayoutDashboard size={17} />} label="Dashboard" />
          <NavItem to="/admin/live-map" icon={<Radio size={17} />} label="Live Map" />
          <NavItem to="/admin/buses" icon={<Bus size={17} />} label="Buses" />
          <NavItem to="/admin/drivers" icon={<Users size={17} />} label="Drivers" />
          <NavItem to="/admin/routes" icon={<Route size={17} />} label="Routes" />
          <NavItem to="/admin/stops" icon={<MapPin size={17} />} label="Stops" />
          <NavItem to="/admin/assign-bus" icon={<LinkIcon size={17} />} label="Assign Bus" />
          <NavItem to="/admin/route-builder" icon={<Map size={17} />} label="Route Builder" />
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-100">
          <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-red-500 hover:text-red-700 transition">
            <LogOut size={16} />Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink to={to} end className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>
      {icon}<span>{label}</span>
    </NavLink>
  );
}
