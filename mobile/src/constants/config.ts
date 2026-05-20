import Constants from "expo-constants";
import { Platform } from "react-native";

type UrlConfig = {
  web?: string;
  androidEmulator?: string;
  androidDevice?: string;
  ios?: string;
  default?: string;
};

type ExpoExtraConfig = {
  apiUrl?: string | UrlConfig;
  socketUrl?: string | UrlConfig;
  appName?: string;
  googleMapsApiKey?: string;
};

const DEFAULT_WEB_API_URL = "http://localhost:5000/api";
const DEFAULT_WEB_SOCKET_URL = "http://localhost:5000";
const DEFAULT_ANDROID_EMULATOR_API_URL = "http://10.0.2.2:5000/api";
const DEFAULT_ANDROID_EMULATOR_SOCKET_URL = "http://10.0.2.2:5000";
const DEFAULT_ANDROID_DEVICE_API_URL = "http://172.20.10.3:5000/api";
const DEFAULT_ANDROID_DEVICE_SOCKET_URL = "http://172.20.10.3:5000";

function getExpoHostAddress(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;

  if (typeof hostUri !== "string" || hostUri.length === 0) return null;
  return hostUri.split(":")[0] || null;
}

function localBackendUrl(path = ""): string | null {
  const host = getExpoHostAddress();
  return host ? `http://${host}:5000${path}` : null;
}

function resolveUrl(
  value: string | UrlConfig | undefined,
  fallback: {
    web: string;
    androidEmulator: string;
    androidDevice: string;
    ios?: string;
    default?: string;
  }
): string {
  if (typeof value === "string") {
    return value;
  }

  if (!value) {
    if (Platform.OS === "web") return fallback.web;
    if (Platform.OS === "android") {
      const isDevice = Boolean((Constants as { isDevice?: boolean }).isDevice);
      return isDevice ? fallback.androidDevice : fallback.androidEmulator;
    }
    if (Platform.OS === "ios") {
      return fallback.ios || fallback.androidDevice;
    }
    return fallback.default || fallback.web;
  }

  if (Platform.OS === "web") {
    return value.web || value.default || fallback.web;
  }

  if (Platform.OS === "android") {
    const isDevice = Boolean((Constants as { isDevice?: boolean }).isDevice);
    const expoDeviceUrl = isDevice
      ? localBackendUrl(fallback.androidDevice.endsWith("/api") ? "/api" : "")
      : null;
    const configuredDeviceUrl = value.androidDevice === fallback.androidDevice
      ? expoDeviceUrl
      : value.androidDevice;
    return (isDevice ? configuredDeviceUrl : value.androidEmulator) || value.default || (isDevice ? fallback.androidDevice : fallback.androidEmulator);
  }

  if (Platform.OS === "ios") {
    return value.ios || value.androidDevice || value.default || fallback.ios || fallback.androidDevice;
  }

  return value.default || fallback.default || fallback.web;
}

const extra = Constants.expoConfig?.extra as ExpoExtraConfig | undefined;

export const config = {
  apiUrl: resolveUrl(extra?.apiUrl, {
    web: DEFAULT_WEB_API_URL,
    androidEmulator: DEFAULT_ANDROID_EMULATOR_API_URL,
    androidDevice: DEFAULT_ANDROID_DEVICE_API_URL,
    default: DEFAULT_WEB_API_URL,
  }),
  socketUrl: resolveUrl(extra?.socketUrl, {
    web: DEFAULT_WEB_SOCKET_URL,
    androidEmulator: DEFAULT_ANDROID_EMULATOR_SOCKET_URL,
    androidDevice: DEFAULT_ANDROID_DEVICE_SOCKET_URL,
    default: DEFAULT_WEB_SOCKET_URL,
  }),
  appName: extra?.appName || "ChaloPB",
  googleMapsApiKey: extra?.googleMapsApiKey || "",
};

export const API_ENDPOINTS = {
  // Auth
  login: "/auth/login",
  register: "/auth/register",
  logout: "/auth/logout",

  // Buses
  buses: "/buses",
  busById: (id: number | string) => `/buses/${id}`,

  // Routes
  routes: "/routes",
  routeById: (id: number | string) => `/routes/${id}`,

  // Stops
  stops: "/stops",
  stopById: (id: number | string) => `/stops/${id}`,

  // Trips
  trips: "/trips",
  tripById: (id: number | string) => `/trips/${id}`,
  searchTrips: "/trips/search",

  // Location tracking
  locations: "/locations",
  updateLocation: "/location/update",

  // ETA
  eta: "/eta",

  // Search
  search: "/search",

  // Driver
  driver: "/driver",
  driverTrips: "/drivers/me/dashboard",
  // Trip timeline
  tripTimeline: (id: any) => `/trips/${id}/timeline`,
  // Search buses
  searchBuses: "/search-buses",

  // Admin
  admin: "/admin",
  adminDashboard: "/admin/dashboard",
  adminBuses: "/admin/buses",
  adminDrivers: "/admin/drivers",
  adminRoutes: "/admin/routes",
  adminStops: "/admin/stops",
  adminTrips: "/admin/trips",
};

export const SOCKET_EVENTS = {
  // Connection
  connect: "connect",
  disconnect: "disconnect",
  error: "error",

  // Bus tracking
  busLocationUpdate: "bus_location_update",
  joinBusRoom: "join_bus_room",
  leaveBusRoom: "leave_bus_room",

  // Trip tracking
  tripUpdate: "trip_update",
  tripStatusChange: "trip_status_change",
  joinTripRoom: "join_trip_room",
  leaveTripRoom: "leave_trip_room",

  // Driver GPS
  driverLocationUpdate: "driver_location_update",
  driverStatusUpdate: "driver_status_update",

  // General
  locationBroadcast: "location_broadcast",
};

export const COLORS = {
  // Futuristic theme
  background: "#0F172A", // Dark navy
  primary: "#2563EB", // Bright blue
  glow: "#60A5FA", // Light blue glow
  white: "#FFFFFF",
  muted: "#94A3B8", // Secondary text
  
  // Legacy colors (for backward compatibility)
  primaryLight: "#2E7DC0",
  primaryDark: "#0f4f8c",
  secondary: "#16a34a",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  
  // Grays
  gray100: "#f3f4f6",
  gray50: "#f8fafc",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",
  black: "#000000",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  section: 28,
};

// BORDER_RADIUS as object for .sm/.md/.lg/.xl/.full usage
export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const BORDER_RADIUS_PRESETS = BORDER_RADIUS;

export const TYPOGRAPHY = {
  h1: { fontSize: 32, fontWeight: "bold", lineHeight: 40 },
  h2: { fontSize: 28, fontWeight: "bold", lineHeight: 36 },
  h3: { fontSize: 24, fontWeight: "bold", lineHeight: 32 },
  h4: { fontSize: 20, fontWeight: "600", lineHeight: 28 },
  body: { fontSize: 16, fontWeight: "400", lineHeight: 24 },
  bodyBold: { fontSize: 16, fontWeight: "600", lineHeight: 24 },
  caption: { fontSize: 12, fontWeight: "400", lineHeight: 16 },
  captionBold: { fontSize: 12, fontWeight: "600", lineHeight: 16 },
};

export const STATUS_COLORS = {
  departed: "#94a3b8",
  arrived: "#16a34a",
  approaching: "#1d4ed8",
  pending: "#cbd5e1",
  active: "#16a34a",
};

export const TIMEOUT_RETRY_MS = 250;
export const RETRY_MAX = 2;
export const SOCKET_RECONNECT_DELAY = 1000;
export const SEARCH_REFRESH_MS = 5000;
export const LOCATION_POLLING_MS = 4000;
export const ANIMATION_DURATION_MS = 2800;
export const MIN_DISTANCE_THRESHOLD = 0.00005;
