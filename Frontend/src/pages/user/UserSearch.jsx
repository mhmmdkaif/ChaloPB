import { useMemo, useState } from "react";
import {
  RECENT_SEARCHES_KEY,
  FAVOURITES_KEY,
  pairKey,
  safeReadPreferenceList,
  saveRecentSearchList,
  toggleFavouriteList,
} from "../../utils/searchPreferences";

export default function UserSearch({ stops, onSearch, loading }) {
  const [sourceInput,      setSourceInput]      = useState("");
  const [destinationInput, setDestinationInput] = useState("");
  const [sourceStop,       setSourceStop]       = useState(null);
  const [destinationStop,  setDestinationStop]  = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => safeReadPreferenceList(RECENT_SEARCHES_KEY));
  const [favourites, setFavourites] = useState(() => safeReadPreferenceList(FAVOURITES_KEY));

  /* ── suggestions ── */
  const sourceSuggestions = useMemo(() => {
    if (!sourceInput || sourceStop) return [];
    return stops.filter(s => s.stop_name.toLowerCase().includes(sourceInput.toLowerCase())).slice(0, 8);
  }, [sourceInput, sourceStop, stops]);

  const destinationSuggestions = useMemo(() => {
    if (!destinationInput || destinationStop) return [];
    return stops.filter(s => s.stop_name.toLowerCase().includes(destinationInput.toLowerCase())).slice(0, 8);
  }, [destinationInput, destinationStop, stops]);

  /* ── recent ── */
  const saveRecentSearch = (source, destination) => {
    setRecentSearches(prev => {
      const next = saveRecentSearchList(prev, source, destination);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  };

  /* ── favourites ── */
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

  /* ── actions ── */
  const handleSearch = async () => {
    if (!sourceStop || !destinationStop) return;
    const ok = await onSearch(sourceStop, destinationStop);
    if (ok) saveRecentSearch(sourceStop, destinationStop);
  };

  const handleSwap = () => {
    setSourceInput(destinationInput);
    setDestinationInput(sourceInput);
    setSourceStop(destinationStop);
    setDestinationStop(sourceStop);
  };

  const handleQuickSearch = async item => {
    if (!item?.source || !item?.destination) return;
    setSourceInput(item.source.stop_name || "");
    setDestinationInput(item.destination.stop_name || "");
    setSourceStop(item.source);
    setDestinationStop(item.destination);
    await onSearch(item.source, item.destination);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.88)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.6)",
      overflow: "hidden",
      boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    }}>

      {/* ── inputs row ── */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 34px 1fr", gap: 8, alignItems: "end" }}>

          {/* FROM */}
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:5, letterSpacing:"0.05em", textTransform:"uppercase" }}>From</label>
            <div style={{ position:"relative" }}>
              <svg style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="7" r="3" stroke="#94a3b8" strokeWidth="1.3"/>
                <path d="M8 10.5v4" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                className="cpb-input"
                placeholder="Search source stop"
                value={sourceInput}
                onChange={e => { setSourceInput(e.target.value); setSourceStop(null); }}
                style={{
                  width:"100%", height:42, background:"#f8fafc",
                  border:"1.5px solid #e2e8f0", borderRadius:9,
                  padding:"0 12px 0 32px", fontFamily:"'DM Sans',sans-serif",
                  fontSize:13, color:"#0f172a", transition:"all 0.15s", boxSizing:"border-box",
                }}
              />
              {sourceSuggestions.length > 0 && (
                <div style={{ position:"absolute", zIndex:20, top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1px solid #e2e8f0", borderRadius:9, boxShadow:"0 4px 16px rgba(0,0,0,0.08)", overflow:"hidden" }}>
                  {sourceSuggestions.map(stop => (
                    <button key={stop.id} type="button" className="cpb-suggestion"
                      onClick={() => { setSourceStop(stop); setSourceInput(stop.stop_name); }}>
                      {stop.stop_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SWAP */}
          <button type="button" onClick={handleSwap} className="cpb-swap" aria-label="Swap stops"
            style={{
              height:42, width:34, borderRadius:9,
              background:"#f8fafc", border:"1.5px solid #e2e8f0",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", color:"#94a3b8", alignSelf:"end", transition:"all 0.15s",
            }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M4 6h11M12.5 3.5L15 6l-2.5 2.5M16 14H5M7.5 11.5L5 14l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* TO */}
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:5, letterSpacing:"0.05em", textTransform:"uppercase" }}>To</label>
            <div style={{ position:"relative" }}>
              <svg style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }} width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 2C5.24 2 3 4.24 3 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="#94a3b8" opacity="0.8"/>
              </svg>
              <input
                type="text"
                className="cpb-input"
                placeholder="Search destination stop"
                value={destinationInput}
                onChange={e => { setDestinationInput(e.target.value); setDestinationStop(null); }}
                style={{
                  width:"100%", height:42, background:"#f8fafc",
                  border:"1.5px solid #e2e8f0", borderRadius:9,
                  padding:"0 12px 0 32px", fontFamily:"'DM Sans',sans-serif",
                  fontSize:13, color:"#0f172a", transition:"all 0.15s", boxSizing:"border-box",
                }}
              />
              {destinationSuggestions.length > 0 && (
                <div style={{ position:"absolute", zIndex:20, top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1px solid #e2e8f0", borderRadius:9, boxShadow:"0 4px 16px rgba(0,0,0,0.08)", overflow:"hidden" }}>
                  {destinationSuggestions.map(stop => (
                    <button key={stop.id} type="button" className="cpb-suggestion"
                      onClick={() => { setDestinationStop(stop); setDestinationInput(stop.stop_name); }}>
                      {stop.stop_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── search button ── */}
      <div style={{ padding:"12px 16px 16px", borderTop:"1px solid #f1f5f9", marginTop:12 }}>
        <button type="button" onClick={handleSearch} disabled={loading} className="cpb-search"
          style={{
            width:"100%", height:40, background:"#1565a8",
            border:"none", borderRadius:8,
            fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:600,
            color:"#fff", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1, transition:"background 0.15s",
            display:"flex", alignItems:"center", justifyContent:"center", gap:7,
          }}>
          {loading ? "Searching…" : (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="#fff" strokeWidth="1.4"/>
                <path d="M10.5 10.5L14 14" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Search Buses
            </>
          )}
        </button>
      </div>

      {/* ── recent + saved ── */}
      {(recentSearches.length > 0 || favourites.length > 0) && (
        <div style={{ padding:"0 16px 16px", display:"flex", flexDirection:"column", gap:10 }}>

          {recentSearches.length > 0 && (
            <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:12 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#cbd5e1", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Recent</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {recentSearches.map((item, idx) => (
                  <button key={`${pairKey(item.source, item.destination)}-${idx}`} type="button"
                    className="cpb-chip" onClick={() => handleQuickSearch(item)}
                    style={{
                      display:"inline-flex", alignItems:"center", gap:5,
                      background:"#f8fafc", border:"1px solid #e2e8f0",
                      borderRadius:6, padding:"4px 10px",
                      fontSize:12, color:"#475569", cursor:"pointer",
                      fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s", whiteSpace:"nowrap",
                    }}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="#94a3b8" strokeWidth="1.3"/>
                      <path d="M8 5v3.5l2 1.2" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    {item.source?.stop_name} → {item.destination?.stop_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {favourites.length > 0 && (
            <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:10 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#cbd5e1", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>Saved</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {favourites.map((item, idx) => (
                  <div key={`${pairKey(item.source, item.destination)}-fav-${idx}`}
                    style={{ display:"inline-flex", alignItems:"center" }}>
                    <button type="button" className="cpb-chip-fav" onClick={() => handleQuickSearch(item)}
                      style={{
                        display:"inline-flex", alignItems:"center", gap:5,
                        background:"#fff", border:"1px solid #fde68a",
                        borderRadius:"6px 0 0 6px", padding:"4px 8px 4px 10px",
                        fontSize:12, color:"#78350f", cursor:"pointer",
                        fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s", whiteSpace:"nowrap",
                      }}>
                      ★ {item.source?.stop_name} → {item.destination?.stop_name}
                    </button>
                    <button type="button" onClick={() => toggleFavourite(item.source, item.destination)}
                      aria-label="Remove"
                      style={{
                        height:"100%", padding:"4px 8px",
                        background:"#fff", border:"1px solid #fde68a",
                        borderLeft:"none", borderRadius:"0 6px 6px 0",
                        fontSize:10, color:"#fbbf24", cursor:"pointer",
                        fontFamily:"'DM Sans',sans-serif",
                      }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* favourite current pair toggle */}
          {sourceStop && destinationStop && (
            <button type="button" onClick={() => toggleFavourite(sourceStop, destinationStop)}
              className="cpb-fav-toggle"
              style={{
                alignSelf:"flex-start", height:28, padding:"0 12px", borderRadius:6,
                background: isCurrentPairFavourite ? "#fffbeb" : "#fff",
                border: isCurrentPairFavourite ? "1px solid #fcd34d" : "1px solid #e2e8f0",
                fontSize:11, fontWeight:600, cursor:"pointer",
                display:"flex", alignItems:"center", gap:5,
                color: isCurrentPairFavourite ? "#b45309" : "#94a3b8",
                fontFamily:"'DM Sans',sans-serif", transition:"all 0.15s",
              }}>
              {isCurrentPairFavourite ? "★ Saved" : "☆ Save this route"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}