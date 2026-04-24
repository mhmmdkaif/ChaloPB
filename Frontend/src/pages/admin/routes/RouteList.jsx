import { useMemo, useState } from "react";

export default function RouteList({
  routes,
  selectedRoute,
  onSelect,
  loading = false,
  error = "",
  onRefresh,
}) {

  const [search, setSearch] = useState("");

  const routeList = useMemo(() => (Array.isArray(routes) ? routes : []), [routes]);

  const filteredRoutes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return routeList;
    return routeList.filter((r) =>
      r.route_name?.toLowerCase().includes(q) ||
      r.start_point?.toLowerCase().includes(q) ||
      r.end_point?.toLowerCase().includes(q)
    );
  }, [routeList, search]);

  return (
    <aside className="w-80 min-w-[18rem] bg-white border border-slate-200 rounded-2xl p-4 flex flex-col shadow-sm overflow-hidden">

      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-800">
            Network Routes
          </h2>
          <p className="text-xs text-slate-500">
            Select a corridor to edit its stop timeline.
          </p>
        </div>

        {typeof onRefresh === "function" && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            Refresh
          </button>
        )}
      </div>

      {/* SEARCH */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search by route or station..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/70"
        />
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-slate-500 text-sm mb-3">
          Loading routes...
        </p>
      )}

      {!loading && routeList.length === 0 && (
        <p className="text-slate-500 text-sm">
          No routes found
        </p>
      )}

      <div className="mt-2 space-y-2 overflow-y-auto pr-1">
        {filteredRoutes.map((r) => {
          const isActive = selectedRoute?.id === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r)}
              className={`w-full text-left p-3 rounded-xl border transition
                ${
                  isActive
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-800"
                }`}
            >
              <p className="font-medium truncate">
                {r.route_name}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {r.start_point} → {r.end_point}
              </p>
            </button>
          );
        })}

        {!loading && routeList.length > 0 && filteredRoutes.length === 0 && (
          <p className="text-xs text-slate-500">
            No routes match your search.
          </p>
        )}
      </div>

    </aside>
  );
}
