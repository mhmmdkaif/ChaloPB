import { beforeEach, describe, expect, it, jest } from "@jest/globals";

var mockQuery = jest.fn();
var mockRelease = jest.fn();

var mockPool = {
  connect: jest.fn(async () => ({
    query: mockQuery,
    release: mockRelease,
  })),
};

var mockInvalidateActiveTripCache = jest.fn();
var mockInvalidateTripStopsCache = jest.fn();
var mockResetBusSmoothing = jest.fn();
var mockResetBusEmitState = jest.fn();
var mockRealtimeEmit = jest.fn();
var mockLogTripEvent = jest.fn(async () => {});

jest.mock("../config/db.js", () => ({ __esModule: true, default: mockPool }));
jest.mock("../services/locationTrackingService.js", () => ({
  __esModule: true,
  invalidateActiveTripCache: mockInvalidateActiveTripCache,
  resetBusEmitState: mockResetBusEmitState,
}));
jest.mock("../services/stopStateMachineService.js", () => ({
  __esModule: true,
  invalidateTripStopsCache: mockInvalidateTripStopsCache,
}));
jest.mock("../services/gpsService.js", () => ({
  __esModule: true,
  resetBusSmoothing: mockResetBusSmoothing,
}));
jest.mock("../services/cacheService.js", () => ({
  __esModule: true,
  getBusState: jest.fn(() => null),
  deleteCache: jest.fn(async () => {}),
  getCache: jest.fn(async () => null),
  setCache: jest.fn(async () => {}),
}));
jest.mock("../services/realtimeBus.js", () => ({
  __esModule: true,
  realtimeBus: { emit: mockRealtimeEmit },
}));
jest.mock("../utils/observability.js", () => ({
  __esModule: true,
  log: jest.fn(),
  logError: jest.fn(),
}));
jest.mock("../controllers/tripController.js", () => ({
  __esModule: true,
  logTripEvent: mockLogTripEvent,
  emitTripStopUpdateForBus: jest.fn(),
}));

let startMyTrip;
let stopMyTrip;

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("driver trip lifecycle", () => {
  beforeEach(async () => {
    if (!startMyTrip || !stopMyTrip) {
      ({ startMyTrip, stopMyTrip } = await import("../controllers/driverController.js"));
    }
    jest.clearAllMocks();
  });

  it("starts a trip successfully", async () => {
    mockQuery.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text === "BEGIN") return { rows: [] };
      if (text.includes("WITH driver AS")) {
        return {
          rows: [
            {
              driver_id: 7,
              bus_id: 101,
              route_id: 22,
              bus_number: "DL-01-AB-1234",
              existing_driver_trip: null,
              existing_bus_trip: null,
              inserted_trip: {
                id: 999,
                bus_id: 101,
                route_id: 22,
                driver_id: 7,
                status: "active",
              },
              chosen_driver_trip: null,
              chosen_bus_trip: null,
            },
          ],
        };
      }
      if (text.includes("INSERT INTO trip_stops")) return { rows: [] };
      if (text === "COMMIT") return { rows: [] };
      if (text === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    });

    const req = { user: { role: "driver", id: 99 }, body: {} };
    const res = createRes();

    await startMyTrip(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body?.message).toBe("Trip started");
    expect(mockInvalidateActiveTripCache).toHaveBeenCalledWith(101);
    expect(mockInvalidateTripStopsCache).toHaveBeenCalledWith(999);
    expect(mockResetBusSmoothing).toHaveBeenCalledWith(101);
    expect(mockLogTripEvent).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
  });

  it("stops an active trip successfully", async () => {
    mockQuery.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text === "BEGIN") return { rows: [] };
      if (text.includes("SELECT id FROM drivers")) return { rows: [{ id: 7 }] };
      if (text.includes("UPDATE trips")) {
        return {
          rows: [
            {
              id: 555,
              bus_id: 101,
              route_id: 22,
              driver_id: 7,
              status: "completed",
              started_at: "2026-04-20T10:00:00.000Z",
              ended_at: "2026-04-20T10:45:00.000Z",
            },
          ],
        };
      }
      if (text.includes("UPDATE trip_stops")) return { rows: [] };
      if (text.includes("DELETE FROM live_locations")) return { rows: [] };
      if (text === "COMMIT") return { rows: [] };
      if (text === "ROLLBACK") return { rows: [] };
      return { rows: [] };
    });

    const req = { user: { role: "driver", id: 99 }, body: {} };
    const res = createRes();

    await stopMyTrip(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.message).toBe("Trip stopped");
    expect(mockInvalidateActiveTripCache).toHaveBeenCalledWith(101);
    expect(mockInvalidateTripStopsCache).toHaveBeenCalledWith(555);
    expect(mockResetBusEmitState).toHaveBeenCalledWith(101);
    expect(mockRealtimeEmit).toHaveBeenCalledTimes(2);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("rejects non-driver role", async () => {
    const req = { user: { role: "user", id: 1 }, body: {} };
    const res = createRes();

    await startMyTrip(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});
