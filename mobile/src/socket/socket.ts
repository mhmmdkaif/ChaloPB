import { io, Socket } from "socket.io-client";
import { config, SOCKET_EVENTS } from "../constants/config";

interface SocketPosition {
  bus_id: number;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  timestamp?: number;
  seq?: number;
}

let socketInstance: Socket | null = null;
let socketUrlCandidates: string[] = [];
let socketUrlIndex = 0;
let pendingToken: string | null = null;
let hasEverConnected = false;
let lastReportedSocketErrorKey: string | null = null;
let lastReportedSocketErrorAt = 0;

/**
 * Connection-state change listeners registered from AuthContext.
 * Stored as refs so that initializeSocket can be called once yet
 * the callbacks remain swappable from React state.
 */
let _onConnectCb: (() => void) | null = null;
let _onDisconnectCb: (() => void) | null = null;
let _onErrorCb: ((err: any) => void) | null = null;

function pushUniqueUrl(urls: string[], candidate?: string | null) {
  if (!candidate) return;
  if (!urls.includes(candidate)) urls.push(candidate);
}

function buildSocketCandidates(): string[] {
  const candidates: string[] = [];
  pushUniqueUrl(candidates, config.socketUrl);

  try {
    const apiUrl = new URL(config.apiUrl);
    pushUniqueUrl(candidates, `${apiUrl.protocol}//${apiUrl.host}`);
  } catch {
    // ignore invalid URL parsing
  }

  return candidates;
}

function cleanupSocketInstance() {
  if (!socketInstance) return;
  try {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
  } catch {
    // ignore
  }
  socketInstance = null;
}

function currentSocketUrl(): string | null {
  return socketUrlCandidates[socketUrlIndex] || null;
}

function createSocket(token: string): Socket | null {
  const url = currentSocketUrl();
  if (!url) return null;

  socketInstance = io(url, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    timeout: 10000,
    transports: ["websocket", "polling"],
  });

  socketInstance.on("connect", () => {
    hasEverConnected = true;
    lastReportedSocketErrorKey = null;
    lastReportedSocketErrorAt = 0;
    _onConnectCb?.();
  });

  socketInstance.on("disconnect", () => {
    _onDisconnectCb?.();
  });

  const handleConnectionError = (err: any) => {
    const message = String(err?.message || err || "connection error");
    const isTimeout = /timeout/i.test(message);
    const errorKey = `${url}|${message}`;
    const now = Date.now();

    if (!hasEverConnected && isTimeout && socketUrlIndex < socketUrlCandidates.length - 1) {
      const failedUrl = currentSocketUrl();
      socketUrlIndex += 1;
      const nextUrl = currentSocketUrl();

      console.warn("[Socket] Falling back to alternate socket URL", {
        failedUrl,
        nextUrl,
        reason: message,
      });

      cleanupSocketInstance();
      createSocket(token);
      return;
    }

    if (lastReportedSocketErrorKey === errorKey && now - lastReportedSocketErrorAt < 15000) {
      return;
    }

    lastReportedSocketErrorKey = errorKey;
    lastReportedSocketErrorAt = now;

    _onErrorCb?.(err);
  };

  socketInstance.on("error", handleConnectionError);
  socketInstance.on("connect_error", handleConnectionError);

  return socketInstance;
}

export function initializeSocket(
  token: string,
  onConnect?: () => void,
  onDisconnect?: () => void,
  onError?: (error: any) => void
): Socket {
  // Always update the callback refs so the latest closures are used
  _onConnectCb = onConnect ?? null;
  _onDisconnectCb = onDisconnect ?? null;
  _onErrorCb = onError ?? null;
  pendingToken = token;
  socketUrlCandidates = buildSocketCandidates();
  socketUrlIndex = 0;
  hasEverConnected = false;

  if (socketInstance?.connected) return socketInstance;

  // If a disconnected socket already exists, clean it up first
  cleanupSocketInstance();

  return createSocket(token) as Socket;
}

export function connectSocket(): void {
  if (socketInstance && !socketInstance.connected) {
    socketInstance.connect();
    return;
  }

  if (!socketInstance && pendingToken) {
    initializeSocket(pendingToken, _onConnectCb ?? undefined, _onDisconnectCb ?? undefined, _onErrorCb ?? undefined);
  }
}

export function disconnectSocket(): void {
  cleanupSocketInstance();
  socketUrlCandidates = [];
  socketUrlIndex = 0;
  pendingToken = null;
  hasEverConnected = false;
}

/**
 * Helper: attach a socket event listener now, or queue it until connected.
 * Returns an unsubscribe function that cleans up both the live listener
 * and the queued-flush listener (if the socket connects after registration).
 */
function safeOn(event: string, callback: (...args: any[]) => void): () => void {
  if (!socketInstance) {
    // No socket at all — nothing to attach to.
    // Return a no-op; the caller should re-register once socketConnected flips.
    return () => {};
  }

  const sock = socketInstance;

  if (sock.connected) {
    // Already connected — attach immediately
    sock.on(event, callback);
    return () => { sock.off(event, callback); };
  }

  // Not connected yet — queue the attachment for when we connect
  let flushed = false;
  const flush = () => {
    if (!flushed) {
      flushed = true;
      sock.on(event, callback);
    }
  };
  sock.once("connect", flush);

  return () => {
    // Remove the queued flush in case connect hasn't fired yet
    sock.off("connect", flush);
    // Remove the actual event listener in case it was already attached
    sock.off(event, callback);
  };
}

/**
 * Helper: emit a socket event now, or queue it until connected.
 */
function safeEmit(event: string, ...args: any[]): void {
  if (!socketInstance) return;

  if (socketInstance.connected) {
    socketInstance.emit(event, ...args);
  } else {
    const sock = socketInstance;
    sock.once("connect", () => {
      sock.emit(event, ...args);
    });
  }
}

export function joinBusRoom(busId: number): void {
  safeEmit("joinBus", busId);
}

export function leaveBusRoom(busId: number): void {
  if (!socketInstance) return;
  socketInstance.emit("leaveBus", busId);
}

export function onBusLocationUpdate(
  callback: (position: SocketPosition) => void
): () => void {
  return safeOn(SOCKET_EVENTS.busLocationUpdate, callback);
}

export function onTripStopUpdate(callback: (data: any) => void): () => void {
  return safeOn("trip_stop_update", callback);
}

export function onTripCompleted(callback: (data: any) => void): () => void {
  return safeOn("trip_completed", callback);
}

export function joinTripRoom(tripId: number): void {
  safeEmit("joinTrip", tripId);
}

export function leaveTripRoom(tripId: number): void {
  if (!socketInstance) return;
  socketInstance.emit("leaveTrip", tripId);
}

export function onTripUpdate(callback: (data: any) => void): () => void {
  return safeOn("trip_update", callback);
}
