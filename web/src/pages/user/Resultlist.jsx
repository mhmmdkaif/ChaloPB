import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FAVOURITES_KEY,
  pairKey,
  safeReadPreferenceList,
  toggleFavouriteList,
} from "../../utils/searchPreferences";

function parseEtaMinutes(etaText) {
  if (!etaText || typeof etaText !== "string") return Number.POSITIVE_INFINITY;
  const match = etaText.match(/(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function stopsAwayColor(n) {
  if (n <= 2) return { bg:"#f0fdf4", color:"#15803d" };
  if (n <= 5) return { bg:"#fffbeb", color:"#b45309" };
  return { bg:"#fef2f2", color:"#dc2626" };
}

export default function ResultList({ routes, sourceStop, destinationStop }) {
  const navigate   = useNavigate();
  const [sortMode, setSortMode] = useState("nearest");
  const [favourites, setFavourites] = useState(() => safeReadPreferenceList(FAVOURITES_KEY));

  const toggleFavourite = (source, destination) => {
    setFavourites(prev => {
      const next = toggleFavouriteList(prev, source, destination);
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const isCurrentPairFavourite = useMemo(() => {
    if (!sourceStop || !destinationStop) return false;
    return favourites.some(i => pairKey(i?.source, i?.destination) === pairKey(sourceStop, destinationStop));
  }, [favourites, sourceStop, destinationStop]);

  const displayedRoutes = useMemo(() => {
    if (sortMode === "all") return routes;
    return routes.map(rg => {
      const buses = [...(rg.buses || [])].sort((a, b) => {
        const aS = Number.isFinite(Number(a.stops_away)) ? Number(a.stops_away) : Infinity;
        const bS = Number.isFinite(Number(b.stops_away)) ? Number(b.stops_away) : Infinity;
        if (aS !== bS) return aS - bS;
        return parseEtaMinutes(a.eta_to_source) - parseEtaMinutes(b.eta_to_source);
      });
      return { ...rg, buses };
    });
  }, [routes, sortMode]);

  const totalBuses = displayedRoutes.reduce((acc, rg) => acc + (rg.buses?.length || 0), 0);

  return (
    <>
      {/* ── meta bar ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"20px 0 10px" }}>
        <div>
          <span style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:700, color:"#fff" }}>
            {totalBuses} buses found
          </span>
          <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:"#86efac", fontWeight:500, marginLeft:8 }}>
            <span className="cpb-live-dot" style={{ width:6, height:6, borderRadius:"50%", background:"#86efac", display:"inline-block" }}/>
            live
          </span>
        </div>

        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          {["nearest", "all"].map(mode => (
            <button key={mode} type="button" onClick={() => setSortMode(mode)}
              className={sortMode === mode ? undefined : "cpb-sort-off"}
              style={{
                height:28, padding:"0 11px", borderRadius:6,
                fontSize:11, fontWeight:600, cursor:"pointer",
                fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s",
                background: sortMode === mode ? "#0f172a" : "rgba(255,255,255,0.8)",
                color:      sortMode === mode ? "#fff"    : "#64748b",
                border:     sortMode === mode ? "none"    : "1px solid rgba(226,232,240,0.8)",
              }}>
              {mode === "nearest" ? "Nearest" : "All"}
            </button>
          ))}

          <button type="button"
            onClick={() => { if (sourceStop && destinationStop) toggleFavourite(sourceStop, destinationStop); }}
            disabled={!sourceStop || !destinationStop}
            className="cpb-fav-toggle"
            style={{
              height:28, width:28, borderRadius:6,
              background: isCurrentPairFavourite ? "#fffbeb" : "rgba(255,255,255,0.8)",
              border:     isCurrentPairFavourite ? "1px solid #fcd34d" : "1px solid rgba(226,232,240,0.8)",
              fontSize:12, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              color:"#f59e0b", transition:"all 0.15s",
              opacity: (!sourceStop || !destinationStop) ? 0.4 : 1,
            }}
            aria-label={isCurrentPairFavourite ? "Remove from saved" : "Save route"}>
            {isCurrentPairFavourite ? "★" : "☆"}
          </button>
        </div>
      </div>

      {/* ── route groups ── */}
      {displayedRoutes.map((routeGroup, index) => (
        <div key={`${routeGroup.route}-${index}`} style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.6)",
          overflow: "hidden",
          marginBottom: 8,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        }}>
          {/* route header */}
          <div style={{
            padding:"9px 14px", background:"rgba(248,250,252,0.9)",
            borderBottom:"1px solid rgba(226,232,240,0.6)",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <span style={{
              fontSize:11, fontWeight:700, color:"#1565a8",
              background:"#eff6ff", borderRadius:4,
              padding:"2px 7px", letterSpacing:"0.02em",
            }}>
              {routeGroup.route}
            </span>
          </div>

          {/* bus rows */}
          {(routeGroup.buses || []).map(bus => {
            const stopsNum = Number.isFinite(Number(bus.stops_away)) ? Number(bus.stops_away) : null;
            const sc       = stopsNum != null ? stopsAwayColor(stopsNum) : null;
            return (
              <div key={bus.trip_id} className="cpb-busrow" style={{
                display:"flex", alignItems:"center",
                padding:"13px 14px",
                borderBottom:"1px solid rgba(248,250,252,0.8)",
                gap:12, transition:"background 0.15s",
              }}>
                {/* icon */}
                <div style={{
                  width:36, height:36, borderRadius:8,
                  background:"linear-gradient(135deg,#1565a8,#1d4ed8)", display:"flex",
                  alignItems:"center", justifyContent:"center",
                  flexShrink:0, color:"#fff",
                  boxShadow:"0 6px 18px rgba(21,101,168,0.22)",
                }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M3 17h18M5 17V9a2 2 0 012-2h10a2 2 0 012 2v8M9 17v2m6-2v2M7 13h2m4 0h2"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                    <span style={{ fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, color:"#0f172a" }}>
                      {bus.bus_number}
                    </span>
                    {stopsNum != null && (
                      <span style={{
                        fontSize:11, fontWeight:600, padding:"2px 7px",
                        borderRadius:4, background:sc.bg, color:sc.color,
                      }}>
                        ● {stopsNum} stops away
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:"#64748b", marginTop:3, lineHeight:1.5 }}>
                    Arriving in{" "}
                    <strong style={{ color:"#1565a8", fontWeight:600 }}>{bus.eta_to_source}</strong>
                    {bus.eta_to_destination && (
                      <> · reaches you in{" "}
                        <strong style={{ color:"#1565a8", fontWeight:600 }}>{bus.eta_to_destination}</strong>
                      </>
                    )}
                  </div>
                </div>

                {/* track */}
                <button type="button" onClick={() => navigate(`/track/${bus.trip_id}`)}
                  className="cpb-track"
                  style={{
                    height:34, padding:"0 14px",
                    background:"#1565a8", border:"none", borderRadius:7,
                    fontFamily:"'DM Sans',sans-serif", fontSize:12, fontWeight:600,
                    color:"#fff", cursor:"pointer", whiteSpace:"nowrap",
                    flexShrink:0, transition:"background 0.15s",
                    display:"flex", alignItems:"center", gap:5,
                  }}>
                  Track
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}