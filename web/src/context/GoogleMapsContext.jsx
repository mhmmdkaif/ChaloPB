import { createContext, useContext, useMemo } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// ── IMPORTANT ──
// The `libraries` array MUST be defined outside the component as a stable
// reference. Passing a new array literal on every render causes
// `useJsApiLoader` to re-trigger the Google Maps script loader and crashes
// production builds with "Cannot access 'X' before initialization".
const MAPS_LIBRARIES = ["geometry"];

const GoogleMapsContext = createContext({
  isLoaded: false,
  loadError: null,
  apiKey: "",
});

/**
 * Single, app-wide Google Maps loader.
 *
 * Wrap your app (or the authenticated shell) with this provider so that
 * `useJsApiLoader` is called exactly ONCE. Every map component then
 * reads the shared `isLoaded` state via the `useGoogleMaps()` hook.
 */
export function GoogleMapsProvider({ children }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "chalopb-maps",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES,
  });

  const value = useMemo(
    () => ({ isLoaded, loadError, apiKey: GOOGLE_MAPS_API_KEY }),
    [isLoaded, loadError]
  );

  return (
    <GoogleMapsContext.Provider value={value}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

/**
 * Hook consumed by any component that needs Google Maps.
 *
 * @returns {{ isLoaded: boolean, loadError: Error | null, apiKey: string }}
 */
export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}
