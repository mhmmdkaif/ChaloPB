import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpolatePosition(start, end, t) {
  return {
    lat: lerp(start.lat, end.lat, t),
    lng: lerp(start.lng, end.lng, t),
  };
}

function isSignificantMove(prev, next, threshold = 0.00005) {
  const dx = prev.lat - next.lat;
  const dy = prev.lng - next.lng;
  return Math.sqrt(dx * dx + dy * dy) > threshold;
}

export default function useLiveBusTracking({
  socketUrl,
  socketAuthToken,
  socketEnabled = true,
  socketEvent = "bus_location_update",
  socketAdditionalEvents = {},
  joinBusIds = [],
  pollEnabled = false,
  pollIntervalMs = 4000,
  pollFetcher,
  pollWhileSocketConnected = false,
  debounceMs = 300,
  moveThreshold = 0.00005,
  animationDurationMs = 800,
}) {
  const [positionsByBusId, setPositionsByBusId] = useState({});
  const [smoothedPositionsByBusId, setSmoothedPositionsByBusId] = useState({});
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const socketRef = useRef(null);
  const prevPositionRef = useRef({});
  const pendingPositionRef = useRef({});
  const debounceTimerRef = useRef({});
  const lastAppliedAtRef = useRef({});
  const rafRef = useRef({});
  const joinedBusIdsRef = useRef(new Set());
  const ingestPositionRef = useRef(null);
  const lastSeqRef = useRef({});

  const cancelAnimation = useCallback((busId) => {
    const frameId = rafRef.current[busId];
    if (frameId != null) {
      cancelAnimationFrame(frameId);
      rafRef.current[busId] = null;
    }
  }, []);

  const animatePosition = useCallback((busId, from, to) => {
    cancelAnimation(busId);
    const startTime = performance.now();

    const animate = (time) => {
      const progress = Math.min((time - startTime) / animationDurationMs, 1);
      const pos = interpolatePosition(from, to, progress);

      setSmoothedPositionsByBusId((prev) => ({
        ...prev,
        [busId]: [pos.lat, pos.lng],
      }));

      if (progress < 1) {
        rafRef.current[busId] = requestAnimationFrame(animate);
      } else {
        rafRef.current[busId] = null;
      }
    };

    rafRef.current[busId] = requestAnimationFrame(animate);
  }, [animationDurationMs, cancelAnimation]);

  const applyLatest = useCallback((busId) => {
    const latest = pendingPositionRef.current[busId];
    if (!latest) return;

    const prev = prevPositionRef.current[busId];

    if (!prev) {
      prevPositionRef.current[busId] = latest;
      setSmoothedPositionsByBusId((map) => ({
        ...map,
        [busId]: [latest.lat, latest.lng],
      }));
    } else {
      animatePosition(busId, prev, latest);
      prevPositionRef.current[busId] = latest;
    }

    lastAppliedAtRef.current[busId] = Date.now();
    pendingPositionRef.current[busId] = null;
  }, [animatePosition]);

  const ingestPosition = useCallback((payload) => {
    const busId = Number(payload?.bus_id);
    const lat = toNumber(payload?.latitude);
    const lng = toNumber(payload?.longitude);

    if (!Number.isFinite(busId) || !isValidLatLng(lat, lng)) return;

    // Sequence guard — drop out-of-order messages
    if (payload?.seq != null) {
      const lastSeq = lastSeqRef.current[busId] ?? -1;
      if (payload.seq <= lastSeq) return; // stale/duplicate, discard
      lastSeqRef.current[busId] = payload.seq;
    }

    const next = { lat, lng };

    setPositionsByBusId((prev) => ({
      ...prev,
      [busId]: {
        ...payload,
        bus_id: busId,
        latitude: lat,
        longitude: lng,
      },
    }));

    const prevPos = prevPositionRef.current[busId];
    if (prevPos && !isSignificantMove(prevPos, next, moveThreshold)) {
      prevPositionRef.current[busId] = next;
      return;
    }

    pendingPositionRef.current[busId] = next;
    const elapsed = Date.now() - (lastAppliedAtRef.current[busId] || 0);

    if (elapsed >= debounceMs) {
      applyLatest(busId);
      return;
    }

    if (!debounceTimerRef.current[busId]) {
      debounceTimerRef.current[busId] = setTimeout(() => {
        debounceTimerRef.current[busId] = null;
        applyLatest(busId);
      }, debounceMs - elapsed);
    }
  }, [applyLatest, debounceMs, moveThreshold]);

  useEffect(() => {
    ingestPositionRef.current = ingestPosition;
  }, [ingestPosition]);

  useEffect(() => {
    if (!socketEnabled || !socketUrl) return;

    const socket = io(
      socketUrl,
      socketAuthToken ? { auth: { token: socketAuthToken } } : undefined
    );

    socketRef.current = socket;
    joinedBusIdsRef.current = new Set();

    const onConnect = () => {
      setIsSocketConnected(true);
    };
    const onDisconnect = () => {
      setIsSocketConnected(false);
      joinedBusIdsRef.current = new Set();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);

      socket.disconnect();
      socketRef.current = null;
      setIsSocketConnected(false);
      joinedBusIdsRef.current = new Set();
    };
  }, [socketAuthToken, socketEnabled, socketUrl]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isSocketConnected) return;

    const onLocation = (payload) => ingestPositionRef.current(payload);
    socket.on(socketEvent, onLocation);

    return () => {
      socket.off(socketEvent, onLocation);
    };
  }, [isSocketConnected, socketEvent]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isSocketConnected) return;

    const extraEventEntries = Object.entries(socketAdditionalEvents || {})
      .filter(([name, handler]) => typeof name === 'string' && typeof handler === 'function');

    for (const [name, handler] of extraEventEntries) {
      socket.on(name, handler);
    }

    return () => {
      for (const [name, handler] of extraEventEntries) {
        socket.off(name, handler);
      }
    };
  }, [isSocketConnected, socketAdditionalEvents]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !Array.isArray(joinBusIds)) return;

    const normalized = joinBusIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);

    for (const id of normalized) {
      if (joinedBusIdsRef.current.has(id)) continue;
      socket.emit("joinBus", id);
      joinedBusIdsRef.current.add(id);
    }
  }, [isSocketConnected, joinBusIds]);

  useEffect(() => {
    if (!pollEnabled || typeof pollFetcher !== "function") return;
    // Avoid duplicate network work: when socket stream is live, polling is unnecessary.
    if (!pollWhileSocketConnected && socketEnabled && isSocketConnected) return;

    let cancelled = false;

    const fetchAndIngest = async () => {
      try {
        const rows = await pollFetcher();
        if (cancelled || !Array.isArray(rows)) return;
        rows.forEach((row) => ingestPosition(row));
      } catch {
        // Keep existing positions if polling fails intermittently.
      }
    };

    fetchAndIngest();
    const id = setInterval(fetchAndIngest, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ingestPosition, isSocketConnected, pollEnabled, pollFetcher, pollIntervalMs, pollWhileSocketConnected, socketEnabled]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimerRef.current).forEach((timerId) => {
        if (timerId) clearTimeout(timerId);
      });

      Object.keys(rafRef.current).forEach((busIdKey) => {
        cancelAnimation(busIdKey);
      });
    };
  }, [cancelAnimation]);

  return {
    socketRef,
    isSocketConnected,
    positionsByBusId,
    smoothedPositionsByBusId,
    ingestPosition,
  };
}
