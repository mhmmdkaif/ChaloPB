/**
 * UserDashboard.jsx — UI/UX Redesign + Production Fixes
 *
 * UI/UX improvements in this version:
 *
 *  NAVBAR
 *  ─ Scroll-aware frosted glass: transparent at top, blurs on scroll
 *  ─ Larger avatar (34px) with hover ring + full name tooltip
 *  ─ Bus icon prefix on brand name for visual identity
 *
 *  HERO / SEARCH AREA
 *  ─ Time-aware greeting ("Good morning, Alice") with fade-in animation
 *  ─ Search card entrance animation (staggered fade-up)
 *
 *  LOADING STATE
 *  ─ Shimmer skeleton card replaces blank space during search
 *  ─ aria-busy + aria-label for screen readers
 *
 *  ERROR STATE
 *  ─ Slide-in toast banner with auto-dismiss after 6s
 *  ─ Manual × close button
 *  ─ role="alert" + aria-live="assertive"
 *
 *  RESULTS
 *  ─ "LIVE · auto-updating" pill above results with pulsing green dot
 *  ─ Results section fades in on appearance
 *
 *  EMPTY STATE
 *  ─ Context-aware copy: "Where are you headed?" vs "No buses on this route"
 *  ─ Animated floating bus icon (gentle bob)
 *  ─ Richer bus illustration with windows and wheels
 *
 *  MICRO-INTERACTIONS
 *  ─ Swap button rotates 180° on hover
 *  ─ Search button lifts on hover
 *  ─ All animations respect prefers-reduced-motion
 *
 *  ACCESSIBILITY
 *  ─ All buttons have aria-label
 *  ─ Error region uses role="alert" + aria-live
 *  ─ Skeleton has aria-busy
 */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { io } from "socket.io-client";
import { AuthContext } from "../../context/AuthContext";
import { decodeJwtPayload } from "../../utils/jwt";

import UserBg from "./UserBg";
import UserSearch from "./UserSearch";
import ResultList from "./Resultlist";

// ─── Constants ────────────────────────────────────────────────────────────────

if (!import.meta.env.VITE_SOCKET_URL) {
  console.warn(
    "[UserDashboard] VITE_SOCKET_URL is not set. " +
    "Socket connections will not work in production."
  );
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "";
const SEARCH_REFRESH_MS = 5_000;
const SOCKET_REFRESH_COOLDOWN_MS = 1_500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(nameOrEmail) {
  if (!nameOrEmail) return "PS";
  const parts = nameOrEmail.split(/[@.\s]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "PS"
  );
}



function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(displayName) {
  if (!displayName || displayName === "Passenger") return null;
  const first = displayName.split(/[@.\s]/)[0] ?? "";
  return first.length > 12 ? first.slice(0, 12) : first;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SearchSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading bus routes…"
      style={{
        marginTop: 20,
        borderRadius: 16,
        overflow: "hidden",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {[1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: "18px 20px",
            borderBottom:
              i === 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="cpb-shimmer"
              style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div
                className="cpb-shimmer"
                style={{
                  height: 13,
                  borderRadius: 6,
                  width: "52%",
                  marginBottom: 8,
                }}
              />
              <div
                className="cpb-shimmer"
                style={{ height: 11, borderRadius: 6, width: "32%" }}
              />
            </div>
            <div
              className="cpb-shimmer"
              style={{ width: 64, height: 28, borderRadius: 8, flexShrink: 0 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        marginTop: 12,
        padding: "11px 16px",
        borderRadius: 10,
        background: "rgba(239,68,68,0.14)",
        border: "1px solid rgba(239,68,68,0.28)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "cpb-slideDown 0.2s ease",
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="7" stroke="#fca5a5" strokeWidth="1.3" />
        <path
          d="M8 5v3.5"
          stroke="#fca5a5"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11" r="0.85" fill="#fca5a5" />
      </svg>
      <span
        style={{ flex: 1, fontSize: 13, color: "#fca5a5", lineHeight: 1.45 }}
      >
        {message}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss error"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 4px",
          color: "rgba(252,165,165,0.65)",
          fontSize: 17,
          lineHeight: 1,
          flexShrink: 0,
          fontFamily: "sans-serif",
        }}
      >
        ×
      </button>
    </div>
  );
}

function LivePill() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 11px",
        borderRadius: 20,
        background: "rgba(16,185,129,0.13)",
        border: "1px solid rgba(16,185,129,0.22)",
        fontSize: 11,
        fontWeight: 600,
        color: "rgba(110,231,183,0.9)",
        letterSpacing: 0.4,
        marginBottom: 10,
      }}
    >
      <span
        className="cpb-live-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#10b981",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      LIVE · auto-updating
    </div>
  );
}

function EmptyState({ hasSearched }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 18,
        border: "1.5px dashed rgba(255,255,255,0.16)",
        padding: "52px 24px 44px",
        textAlign: "center",
        marginTop: 20,
        animation: "cpb-fadeUp 0.4s ease",
      }}
    >
      <div
        className="cpb-float"
        style={{ display: "inline-block", marginBottom: 20 }}
        aria-hidden="true"
      >
        <svg
          width="54"
          height="54"
          viewBox="0 0 120 120"
          fill="none"
          style={{ display: "block" }}
        >
          <rect x="12" y="27" width="96" height="55" rx="12" fill="rgba(255,255,255,0.16)" />
          <rect x="20" y="37" width="80" height="28" rx="6" fill="rgba(255,255,255,0.1)" />
          <rect x="24" y="41" width="20" height="16" rx="3" fill="rgba(255,255,255,0.38)" />
          <rect x="50" y="41" width="20" height="16" rx="3" fill="rgba(255,255,255,0.38)" />
          <rect x="76" y="41" width="20" height="16" rx="3" fill="rgba(255,255,255,0.38)" />
          <rect x="50" y="59" width="20" height="23" rx="3" fill="rgba(255,255,255,0.18)" />
          <circle cx="32" cy="89" r="10" fill="rgba(255,255,255,0.2)" />
          <circle cx="32" cy="89" r="5" fill="rgba(255,255,255,0.45)" />
          <circle cx="88" cy="89" r="10" fill="rgba(255,255,255,0.2)" />
          <circle cx="88" cy="89" r="5" fill="rgba(255,255,255,0.45)" />
        </svg>
      </div>

      <p
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 16,
          fontWeight: 700,
          color: "rgba(255,255,255,0.9)",
          marginBottom: 7,
          lineHeight: 1.3,
        }}
      >
        {hasSearched ? "No buses on this route" : "Where are you headed?"}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.45)",
          lineHeight: 1.65,
          maxWidth: 290,
          margin: "0 auto",
        }}
      >
        {hasSearched
          ? "No active buses right now. Results refresh automatically every few seconds."
          : "Pick a source and destination stop above to see live buses on that route."}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);

  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSearch, setLastSearch] = useState(null);
  const [sourceStop, setSourceStop] = useState(null);
  const [destinationStop, setDestinationStop] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const socketRef = useRef(null);
  const lastSocketRefreshRef = useRef(0);
  const lastSeqByBusRef = useRef(new Map());
  const allowAutoRefreshRef = useRef(false);
  const routesRef = useRef(routes);
  useEffect(() => { routesRef.current = routes; }, [routes]);

  // ── Scroll-aware navbar ───────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);



  // ── Derived values ────────────────────────────────────────────────────────
  const userDisplayName = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.email) return user.email;
    const token = user?.token ?? localStorage.getItem("token");
    if (!token) return "Passenger";
    const payload = decodeJwtPayload(token);
    return payload?.name ?? payload?.email ?? "Passenger";
  }, [user]);

  const initials = useMemo(() => getInitials(userDisplayName), [userDisplayName]);

  const greeting = useMemo(() => {
    const firstName = getFirstName(userDisplayName);
    return firstName ? `${getGreeting()}, ${firstName}` : getGreeting();
  }, [userDisplayName]);

  // ── Load stops ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api
      .get("/stops", { params: { limit: 500 } })
      .then((res) => {
        if (!cancelled)
          setStops(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => { if (!cancelled) setError("Unable to load stops right now."); });
    return () => { cancelled = true; };
  }, []);

  // ── Core search ───────────────────────────────────────────────────────────
  const runSearch = useCallback(async ({ source, destination, silent = false }) => {
    if (!source || !destination) { if (!silent) setError("Select both stops."); return false; }
    if (source.id === destination.id) { if (!silent) setError("Source and destination must differ."); return false; }
    if (!silent) { setLoading(true); setError(""); }
    try {
      const res = await api.get("/search-buses", {
        params: { source_stop_id: source.id, destination_stop_id: destination.id },
      });
      const payloadRoutes = Array.isArray(res.data?.routes)
        ? res.data.routes
        : res.data?.route && Array.isArray(res.data?.buses)
          ? [{ route: res.data.route, buses: res.data.buses }]
          : [];
      if (payloadRoutes.length > 0) { setRoutes(payloadRoutes); if (!silent) setError(""); return true; }
      if (!silent) { setRoutes([]); setError("No active buses found for this direction."); }
      return false;
    } catch (err) { console.error("Search failed:", err);
      if (!silent) { setRoutes([]); setError("Search failed. Please try again."); }
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const runSearchRef = useRef(runSearch);
  useEffect(() => { runSearchRef.current = runSearch; }, [runSearch]);

  const handleSearch = useCallback(async (source, destination) => {
    allowAutoRefreshRef.current = true;
    lastSeqByBusRef.current.clear();
    setHasSearched(true);
    setSourceStop(source);
    setDestinationStop(destination);
    setLastSearch({
      source: { id: source.id, stop_name: source.stop_name },
      destination: { id: destination.id, stop_name: destination.stop_name },
    });
    return runSearchRef.current({ source, destination, silent: false });
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastSearch) return;
    const id = setInterval(() => {
      if (allowAutoRefreshRef.current)
        runSearchRef.current({ source: lastSearch.source, destination: lastSearch.destination, silent: true });
    }, SEARCH_REFRESH_MS);
    return () => clearInterval(id);
  }, [lastSearch]);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lastSearch || !SOCKET_URL) return;
    const socket = io(SOCKET_URL, { transports: ["websocket"], reconnectionAttempts: 5 });
    socketRef.current = socket;

    const scheduleRefresh = () => {
      if (!allowAutoRefreshRef.current) return;
      const now = Date.now();
      if (now - lastSocketRefreshRef.current < SOCKET_REFRESH_COOLDOWN_MS) return;
      lastSocketRefreshRef.current = now;
      runSearchRef.current({ source: lastSearch.source, destination: lastSearch.destination, silent: true });
    };

    const handleBusLocationUpdate = (payload) => {
      const busId = Number(payload?.bus_id);
      const seq = Number(payload?.seq ?? 0);
      if (!Number.isFinite(busId) || !seq) return;
      const lastSeq = lastSeqByBusRef.current.get(busId) ?? 0;
      if (seq <= lastSeq) return;
      lastSeqByBusRef.current.set(busId, seq);
      scheduleRefresh();
    };

    const handleTripStopUpdate = (payload) => {
      const busId = Number(payload?.bus_id);
      if (Number.isFinite(busId) && busId > 0) scheduleRefresh();
    };

    const joinCurrentBuses = () => {
      const ids = Array.from(new Set(
        (routesRef.current ?? []).flatMap((r) => r.buses ?? [])
          .map((b) => Number(b.bus_id)).filter((id) => Number.isFinite(id) && id > 0)
      ));
      ids.forEach((id) => socket.emit("joinBus", id));
    };

    socket.on("bus_location_update", handleBusLocationUpdate);
    socket.on("trip_stop_update", handleTripStopUpdate);
    socket.on("connect", joinCurrentBuses);
    if (socket.connected) joinCurrentBuses();

    return () => {

      socket.off("bus_location_update", handleBusLocationUpdate);
      socket.off("trip_stop_update", handleTripStopUpdate);
      socket.off("connect", joinCurrentBuses);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [lastSearch]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !lastSearch) return;
    const ids = Array.from(new Set(
      routes.flatMap((r) => r.buses ?? [])
        .map((b) => Number(b.bus_id)).filter((id) => Number.isFinite(id) && id > 0)
    ));
    ids.forEach((id) => socket.emit("joinBus", id));
  }, [routes, lastSearch]);

  const handleLogout = useCallback(() => { logout(); navigate("/login"); }, [logout, navigate]);
  const dismissError = useCallback(() => setError(""), []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        .cpb-input::placeholder { color: rgba(203,213,225,0.6); }
        .cpb-input:focus {
          border-color: rgba(99,179,237,0.65) !important;
          background: rgba(255,255,255,0.11) !important;
          box-shadow: 0 0 0 3px rgba(99,179,237,0.12) !important;
          outline: none;
        }
        .cpb-chip:hover       { background:rgba(255,255,255,0.18) !important; border-color:rgba(255,255,255,0.35) !important; }
        .cpb-swap             { transition: transform 0.3s ease, background 0.15s !important; }
        .cpb-swap:hover       { background:rgba(255,255,255,0.2) !important; transform:rotate(180deg) scale(1.08) !important; }
        .cpb-search           { transition: all 0.18s ease !important; }
        .cpb-search:hover     { background:rgba(255,255,255,0.96) !important; color:#0f172a !important; transform:translateY(-1px) !important; }
        .cpb-logout:hover     { background:rgba(255,255,255,0.96) !important; color:#0f172a !important; }
        .cpb-busrow:hover     { background:rgba(255,255,255,0.05) !important; }
        .cpb-sort-off:hover   { border-color:rgba(255,255,255,0.3) !important; }
        .cpb-fav-toggle:hover { background:rgba(254,243,199,0.14) !important; }
        .cpb-track:hover      { background:rgba(255,255,255,0.96) !important; color:#0f172a !important; }
        .cpb-avatar           { transition: all 0.15s; }
        .cpb-avatar:hover     { border-color:rgba(255,255,255,0.7) !important; background:rgba(255,255,255,0.26) !important; }

        .cpb-suggestion { display:block; width:100%; padding:9px 14px; text-align:left; font-size:13px; color:#000000; background:transparent; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .cpb-suggestion:hover { background:rgba(255,255,255,0.09); }

        @keyframes cpb-blink  { 0%,100%{opacity:1} 50%{opacity:0.18} }
        .cpb-live-dot { animation: cpb-blink 2s ease-in-out infinite; }

        @keyframes cpb-shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position:  400px 0; }
        }
        .cpb-shimmer {
          background: linear-gradient(90deg,
            rgba(255,255,255,0.05) 25%,
            rgba(255,255,255,0.13) 50%,
            rgba(255,255,255,0.05) 75%);
          background-size: 400px 100%;
          animation: cpb-shimmer 1.5s ease-in-out infinite;
        }

        @keyframes cpb-fadeUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes cpb-slideDown {
          from { opacity:0; transform:translateY(-8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes cpb-float {
          0%,100% { transform: translateY(0px);  }
          50%     { transform: translateY(-8px); }
        }
        .cpb-float { animation: cpb-float 3.4s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .cpb-shimmer,.cpb-live-dot,.cpb-float,.cpb-swap,
          .cpb-search,.cpb-avatar { animation:none !important; transition:none !important; }
        }
      `}</style>

      <UserBg />

      <div
        style={{
          minHeight: "100vh",
          fontFamily: "'DM Sans', sans-serif",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ═══ NAVBAR ═══ */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: scrolled ? "rgba(14, 28, 55, 0.62)" : "transparent",
            backdropFilter: scrolled ? "blur(20px)" : "none",
            WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
            borderBottom: scrolled
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid transparent",
            padding: "0 24px",
            height: 58,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "background 0.28s ease, border-color 0.28s ease, backdrop-filter 0.28s ease",
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="6" width="18" height="12" rx="2.5" fill="rgba(255,255,255,0.22)" />
              <rect x="5.5" y="9" width="3.5" height="4" rx="1" fill="rgba(255,255,255,0.55)" />
              <rect x="10.25" y="9" width="3.5" height="4" rx="1" fill="rgba(255,255,255,0.55)" />
              <rect x="15" y="9" width="3.5" height="4" rx="1" fill="rgba(255,255,255,0.55)" />
              <circle cx="7.5" cy="20" r="2" fill="rgba(255,255,255,0.38)" />
              <circle cx="16.5" cy="20" r="2" fill="rgba(255,255,255,0.38)" />
            </svg>
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 17,
                fontWeight: 800,
                color: "#fff",
                letterSpacing: -0.3,
              }}
            >
              ChaloPB
            </span>
          </div>

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              title={userDisplayName}
              aria-label={`Signed in as ${userDisplayName}`}
              className="cpb-avatar"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.16)",
                border: "1.5px solid rgba(255,255,255,0.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                cursor: "default",
                userSelect: "none",
              }}
            >
              {initials}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="cpb-logout"
              aria-label="Sign out"
              style={{
                height: 32,
                padding: "0 14px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255,255,255,0.82)",
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s",
                backdropFilter: "blur(8px)",
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* ═══ PAGE CONTENT ═══ */}
        <div style={{ maxWidth: 620, margin: "0 auto", padding: "34px 16px 72px" }}>

          {/* Greeting */}
          <p
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 22,
              fontWeight: 800,
              color: "#fff",
              marginBottom: 22,
              letterSpacing: -0.5,
              lineHeight: 1.2,
              animation: "cpb-fadeUp 0.4s ease 0.05s both",
            }}
          >
            {greeting} 👋
          </p>

          {/* Search card */}
          <div style={{ animation: "cpb-fadeUp 0.4s ease 0.13s both" }}>
            <UserSearch stops={stops} onSearch={handleSearch} loading={loading} />
          </div>

          {/* Error */}
          <ErrorBanner message={error} onClose={dismissError} />

          {/* Loading skeleton */}
          {loading && <SearchSkeleton />}

          {/* Results */}
          {!loading && routes.length > 0 && (
            <div style={{ marginTop: 8, animation: "cpb-fadeUp 0.35s ease both" }}>
              <LivePill />
              <ResultList
                routes={routes}
                sourceStop={sourceStop}
                destinationStop={destinationStop}
              />
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && routes.length === 0 && (
            <EmptyState hasSearched={hasSearched} />
          )}
        </div>
      </div>
    </>
  );
}