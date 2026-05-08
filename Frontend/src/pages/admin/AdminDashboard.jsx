import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/api";
import {
  MapPin,
  Route,
  Bus,
  Users,
  PlusCircle,
} from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    routes: 0,
    stops: 0,
    buses: 0,
    drivers: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const [routesRes, stopsRes, busesRes, driversRes] = await Promise.all([
        api.get("/routes", { params: { limit: 1 } }),
        api.get("/stops", { params: { limit: 1 } }),
        api.get("/buses", { params: { limit: 1 } }),
        api.get("/admin/drivers", { params: { limit: 1 } }),
      ]);

      const total = (r) => (r?.data?.total != null ? Number(r.data.total) : (Array.isArray(r?.data?.data) ? r.data.data.length : 0));
      setStats({
        routes: total(routesRes),
        stops: total(stopsRes),
        buses: total(busesRes),
        drivers: total(driversRes),
      });
    } catch (err) {
      console.error("Stats fetch failed:", err?.response?.data || err.message);
      setStats({ routes: 0, stops: 0, buses: 0, drivers: 0 });
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-10">

      {/* TOP BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900">
            Operations Overview
          </h1>
          <p className="text-sm text-slate-500">
            Monitor and manage live bus operations, routes, drivers, and stops.
          </p>
        </div>

        <Link
          to="/admin/assign-bus"
          className="mt-2 md:mt-0 inline-flex items-center gap-2
          bg-blue-600 text-white px-4 py-2 rounded-full text-sm
          hover:bg-blue-700 transition shadow-sm"
        >
          <PlusCircle size={18} />
          Assign Bus
        </Link>
      </div>

      {/* KEY METRICS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard title="Routes" value={stats.routes} icon={<Route />} color="bg-blue-500" />
            <StatCard title="Stops" value={stats.stops} icon={<MapPin />} color="bg-emerald-500" />
            <StatCard title="Buses" value={stats.buses} icon={<Bus />} color="bg-orange-500" />
            <StatCard title="Drivers" value={stats.drivers} icon={<Users />} color="bg-purple-500" />
          </>
        )}
      </section>

      {/* GRID: NETWORK & QUICK ACTIONS */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* NETWORK SNAPSHOT */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                Network snapshot
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                High-level view of configured routes, buses and coverage.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {statsLoading ? (
              <>
                <SnapshotRowSkeleton />
                <SnapshotRowSkeleton />
                <SnapshotRowSkeleton />
                <SnapshotRowSkeleton />
              </>
            ) : (
              <>
                <SnapshotRow label="Configured routes" value={stats.routes} description="Defined paths available for trip planning." />
                <SnapshotRow label="Registered stops" value={stats.stops} description="Bus stops with coordinates for tracking." />
                <SnapshotRow label="Fleet size" value={stats.buses} description="Total buses available in the system." />
                <SnapshotRow label="Active drivers" value={stats.drivers} description="Drivers linked to user accounts." />
              </>
            )}
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">

          <h2 className="text-lg font-semibold mb-3 text-slate-800">
            Quick actions
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Jump directly into key administrative tasks.
          </p>

          <div className="grid grid-cols-1 gap-3">

            <ActionCard
              title="Manage routes"
              description="Create and maintain bus routes."
              link="/admin/routes"
            />

            <ActionCard
              title="Manage stops"
              description="Add or update stop locations."
              link="/admin/stops"
            />

            <ActionCard
              title="Manage buses"
              description="Register buses and assign routes."
              link="/admin/buses"
            />

            <ActionCard
              title="Manage drivers"
              description="Onboard drivers and review assignments."
              link="/admin/drivers"
            />

          </div>

        </div>

      </section>

    </div>
  );
}

/* COMPONENTS */

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="h-4 w-20 bg-slate-200 rounded" />
          <div className="h-9 w-14 bg-slate-200 rounded mt-2" />
        </div>
        <div className="w-12 h-12 bg-slate-200 rounded-lg" />
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-sm">{title}</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-1">{value}</h3>
        </div>
        <div className={`${color} text-white p-3 rounded-lg shadow-sm`}>{icon}</div>
      </div>
    </div>
  );
}

function SnapshotRowSkeleton() {
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 animate-pulse">
      <div className="h-3 w-24 bg-slate-200 rounded" />
      <div className="h-6 w-12 bg-slate-200 rounded mt-2" />
      <div className="h-3 w-32 bg-slate-200 rounded mt-2" />
    </div>
  );
}

function SnapshotRow({ label, value, description }) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <span className="text-xs font-medium text-slate-600">
        {label}
      </span>
      <span className="text-xl font-semibold text-slate-900">
        {value}
      </span>
      <span className="mt-1 text-[11px] text-slate-500">
        {description}
      </span>
    </div>
  );
}

function ActionCard({ title, description, link }) {
  return (
    <Link
      to={link}
      className="
        flex flex-col gap-1
        rounded-lg border border-slate-200 bg-slate-50/60
        px-3 py-3 text-sm
        hover:bg-slate-100 hover:border-slate-300
        transition-colors
      "
    >
      <p className="font-semibold text-slate-800">
        {title}
      </p>

      <p className="text-xs text-slate-500">
        {description}
      </p>
    </Link>
  );
}