import { describe, expect, it } from "@jest/globals";
import { AppError } from "../utils/AppError.js";
import {
  isTeleport,
  resetBusSmoothing,
  shouldDropLowAccuracy,
  smoothCoords,
  smoothSpeed,
  validateAndNormalizeGpsPayload,
} from "../services/gpsService.js";

describe("gpsService", () => {
  it("validates and normalizes valid payload", () => {
    const payload = validateAndNormalizeGpsPayload({
      bus_id: 101,
      latitude: "28.6139",
      longitude: "77.2090",
      speed: "32.5",
      accuracy: "12",
      sequence: 9,
    });

    expect(payload.busId).toBe(101);
    expect(payload.latitude).toBeCloseTo(28.6139, 6);
    expect(payload.longitude).toBeCloseTo(77.209, 6);
    expect(payload.speed).toBeCloseTo(32.5, 6);
    expect(payload.accuracy).toBe(12);
    expect(payload.sequence).toBe(9);
  });

  it("throws for invalid coordinates", () => {
    expect(() =>
      validateAndNormalizeGpsPayload({ bus_id: 1, latitude: 200, longitude: 77 })
    ).toThrow(AppError);
  });

  it("throws for invalid sequence", () => {
    expect(() =>
      validateAndNormalizeGpsPayload({
        bus_id: 1,
        latitude: 28.6,
        longitude: 77.2,
        seq: -1,
      })
    ).toThrow(AppError);
  });

  it("drops low accuracy payloads above threshold", () => {
    expect(shouldDropLowAccuracy(1000)).toBe(true);
    expect(shouldDropLowAccuracy(5)).toBe(false);
  });

  it("detects teleport jumps", () => {
    const lastTs = new Date("2026-01-01T10:00:00.000Z");
    const newTs = new Date("2026-01-01T10:00:10.000Z");
    const teleported = isTeleport(28.6139, 77.209, lastTs, 19.076, 72.8777, newTs);
    expect(teleported).toBe(true);
  });

  it("smooths speed and coordinates with reset support", () => {
    const busId = 777;

    const firstSpeed = smoothSpeed(busId, 20);
    const secondSpeed = smoothSpeed(busId, 40);
    expect(firstSpeed).toBe(20);
    expect(secondSpeed).toBeCloseTo(30, 6);

    const firstCoord = smoothCoords(busId, 28.6, 77.2);
    const secondCoord = smoothCoords(busId, 28.8, 77.4);
    expect(firstCoord).toEqual({ lat: 28.6, lng: 77.2 });
    expect(secondCoord.lat).toBeCloseTo(28.68, 6);
    expect(secondCoord.lng).toBeCloseTo(77.28, 6);

    resetBusSmoothing(busId);

    const afterResetSpeed = smoothSpeed(busId, 55);
    const afterResetCoord = smoothCoords(busId, 29.1, 77.8);
    expect(afterResetSpeed).toBe(55);
    expect(afterResetCoord).toEqual({ lat: 29.1, lng: 77.8 });
  });
});
