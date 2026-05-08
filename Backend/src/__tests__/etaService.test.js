import { describe, expect, it } from "@jest/globals";
import {
  buildRouteEta,
  calculateETA,
  calculateRouteDistanceToOrder,
} from "../services/etaService.js";

describe("etaService", () => {
  it("calculates minimum eta as at least 1 minute", () => {
    expect(calculateETA(0, 0, 0)).toBe(1);
  });

  it("adds dwell time to eta", () => {
    const eta = calculateETA(12, 24, 3);
    expect(eta).toBeGreaterThanOrEqual(31);
  });

  it("returns null when target order is not found", () => {
    const distance = calculateRouteDistanceToOrder([], 28.61, 77.2, 9);
    expect(distance).toBeNull();
  });

  it("builds route eta for next stop and route end", () => {
    const routeStops = [
      { stop_id: 11, stop_order: 1, latitude: 28.6139, longitude: 77.209 },
      { stop_id: 12, stop_order: 2, latitude: 28.6201, longitude: 77.2131 },
      { stop_id: 13, stop_order: 3, latitude: 28.627, longitude: 77.219 },
    ];

    const nextStop = routeStops[1];
    const result = buildRouteEta(routeStops, nextStop, 28.614, 77.2095, 24);

    expect(result.etaToNextMinutes).not.toBeNull();
    expect(result.etaToRouteEndMinutes).not.toBeNull();
    expect(result.etaToRouteEndMinutes).toBeGreaterThanOrEqual(result.etaToNextMinutes);
  });
});
