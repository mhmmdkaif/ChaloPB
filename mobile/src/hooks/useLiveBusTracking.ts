/**
 * useLiveBusTracking - Hook for real-time bus position tracking
 * Handles socket events, position interpolation, and smooth animation
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { onBusLocationUpdate, joinBusRoom } from "../socket/socket";
import {
  isValidLatLng,
  isSignificantMove,
} from "../utils/helpers";
import {
  ANIMATION_DURATION_MS,
  MIN_DISTANCE_THRESHOLD,
} from "../constants/config";

export interface BusPosition {
  bus_id: number;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  timestamp?: number;
}

export interface BusPositionState {
  [busId: number]: BusPosition;
}

export interface BusSmoothedPosition {
  [busId: number]: [number, number]; // [lat, lng]
}

interface UseLiveBusTrackingOptions {
  busIds?: number[];
  enabled?: boolean;
  animationDurationMs?: number;
  moveThreshold?: number;
}

export function useLiveBusTracking({
  busIds = [],
  enabled = true,
  animationDurationMs = ANIMATION_DURATION_MS,
  moveThreshold = MIN_DISTANCE_THRESHOLD,
}: UseLiveBusTrackingOptions) {
  const [positions, setPositions] = useState<BusPositionState>({});
  const [smoothedPositions, setSmoothedPositions] =
    useState<BusSmoothedPosition>({});

  const prevPositionRef = useRef<{ [busId: number]: { lat: number; lng: number } }>({});
  const animRefs = useRef<{
    [busId: number]: {
      xy: Animated.ValueXY;
      listenerId: string;
    };
  }>({});
  const activeAnimationsRef = useRef<{ [busId: number]: Animated.CompositeAnimation[] }>({});
  const lastReceivedAtRef = useRef<{ [busId: number]: number }>({});
  const joinedBusIdsRef = useRef<Set<number>>(new Set());

  /**
   * Cancel animation for a bus
   */
  const stopActiveAnimations = useCallback((busId: number) => {
    const active = activeAnimationsRef.current[busId] || [];
    active.forEach((anim) => {
      try {
        anim.stop();
      } catch (err) {
        // ignore
      }
    });
    activeAnimationsRef.current[busId] = [];
  }, []);

  const ensureAnimRefs = useCallback((busId: number, initial: { lat: number; lng: number }) => {
    if (!animRefs.current[busId]) {
      const xy = new Animated.ValueXY({ x: initial.lat, y: initial.lng });

      // Single listener for both axes — one setState per frame
      const listenerId = xy.addListener(({ x, y }) => {
        setSmoothedPositions((prev) => ({ ...prev, [busId]: [x, y] }));
      });

      animRefs.current[busId] = { xy, listenerId };
      activeAnimationsRef.current[busId] = [];
    }
  }, []);

  const removeAnimRefs = useCallback((busId: number) => {
    stopActiveAnimations(busId);
    const ref = animRefs.current[busId];
    if (ref) {
      try {
        ref.xy.removeListener(ref.listenerId);
      } catch (err) {
        // ignore
      }
      delete animRefs.current[busId];
      delete activeAnimationsRef.current[busId];
    }
    setSmoothedPositions((prev) => {
      const copy = { ...prev };
      delete copy[busId];
      return copy;
    });
  }, [stopActiveAnimations]);

  /**
   * Compute adaptive animation duration based on interval between incoming positions.
   * Uses interval * 0.9 clamped to [800, 4000] ms.
   */
  const getAdaptiveDuration = useCallback(
    (busId: number): number => {
      const now = Date.now();
      const lastAt = lastReceivedAtRef.current[busId];
      lastReceivedAtRef.current[busId] = now;

      if (lastAt == null) {
        return animationDurationMs;
      }

      const interval = now - lastAt;
      const adaptive = interval * 0.9;
      return Math.max(800, Math.min(4000, adaptive));
    },
    [animationDurationMs]
  );

  const animatePosition = useCallback(
    (busId: number, from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
      ensureAnimRefs(busId, from);
      stopActiveAnimations(busId);

      const duration = getAdaptiveDuration(busId);

      const composite = Animated.timing(animRefs.current[busId].xy, {
        toValue: { x: to.lat, y: to.lng },
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      });

      activeAnimationsRef.current[busId] = [composite];
      composite.start(() => {
        activeAnimationsRef.current[busId] = [];
      });
    },
    [ensureAnimRefs, stopActiveAnimations, getAdaptiveDuration]
  );

  /**
   * Ingest position update from socket — animate immediately (no debounce)
   */
  const ingestPosition = useCallback(
    (payload: BusPosition) => {
      const busId = Number(payload?.bus_id);
      const lat = Number(payload?.latitude);
      const lng = Number(payload?.longitude);

      if (!Number.isFinite(busId) || !isValidLatLng(lat, lng)) {
        if (__DEV__) {
          console.warn("[LiveBusTracking] Dropped invalid socket payload", {
            busId,
            latitude: payload?.latitude,
            longitude: payload?.longitude,
          });
        }
        return;
      }

      const next = { lat, lng };

      // Update raw position
      setPositions((prev) => ({
        ...prev,
        [busId]: {
          ...payload,
          bus_id: busId,
          latitude: lat,
          longitude: lng,
        },
      }));

      // Check if movement is significant
      const prevPos = prevPositionRef.current[busId];
      if (prevPos && !isSignificantMove(prevPos, next, moveThreshold)) {
        prevPositionRef.current[busId] = next;
        return;
      }

      if (!prevPos) {
        // First position — snap immediately
        prevPositionRef.current[busId] = next;
        ensureAnimRefs(busId, next);
        animRefs.current[busId].xy.setValue({ x: next.lat, y: next.lng });
        setSmoothedPositions((map) => ({ ...map, [busId]: [next.lat, next.lng] }));
        // Seed the timing tracker
        lastReceivedAtRef.current[busId] = Date.now();
      } else {
        // Animate to new position immediately
        animatePosition(busId, prevPos, next);
        prevPositionRef.current[busId] = next;
      }
    },
    [animatePosition, moveThreshold, ensureAnimRefs]
  );

  /**
   * Join/leave bus rooms
   */
  useEffect(() => {
    if (!enabled) return;

    const currentBusIds = new Set(busIds);
    const previousBusIds = joinedBusIdsRef.current;

    // Join new rooms
    for (const busId of currentBusIds) {
      if (!previousBusIds.has(busId)) {
        joinBusRoom(busId);
        previousBusIds.add(busId);
      }
    }

    // Cleanup removed rooms (no backend leave event; cleanup local resources)
    for (const busId of Array.from(previousBusIds)) {
      if (!currentBusIds.has(busId)) {
        previousBusIds.delete(busId);
        removeAnimRefs(busId);
        delete prevPositionRef.current[busId];
        delete lastReceivedAtRef.current[busId];
      }
    }

    return () => {
      // Cleanup on unmount
      for (const busId of Array.from(previousBusIds)) {
        removeAnimRefs(busId);
      }
      joinedBusIdsRef.current = new Set();
    };
  }, [busIds, enabled, removeAnimRefs]);

  /**
   * Listen to socket bus location updates
   */
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = onBusLocationUpdate((position) => {
      ingestPosition(position);
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, ingestPosition]);

  return {
    positions,
    smoothedPositions,
  };
}
