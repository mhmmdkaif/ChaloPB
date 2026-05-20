import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let handlers;
let mockSocket;

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

import useLiveBusTracking from "../hooks/useLiveBusTracking";

describe("useLiveBusTracking", () => {
  beforeEach(() => {
    handlers = {};
    mockSocket = {
      on: vi.fn((event, cb) => {
        handlers[event] = cb;
      }),
      off: vi.fn((event) => {
        delete handlers[event];
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
  });

  it("registers and cleans up additional socket listeners", async () => {
    const handlerA = vi.fn();

    const { rerender, unmount } = renderHook((props) => useLiveBusTracking(props), {
      initialProps: {
        socketUrl: "http://localhost:3000",
        socketAdditionalEvents: { trip_completed: handlerA },
      },
    });

    await act(async () => {
      handlers.connect?.();
    });

    await act(async () => {
      handlers.trip_completed?.({ trip_id: 88 });
    });
    expect(handlerA).toHaveBeenCalledWith({ trip_id: 88 });

    const handlerB = vi.fn();
    rerender({
      socketUrl: "http://localhost:3000",
      socketAdditionalEvents: { trip_completed: handlerB },
    });

    await act(async () => {
      handlers.trip_completed?.({ trip_id: 99 });
    });

    expect(handlerB).toHaveBeenCalledWith({ trip_id: 99 });

    unmount();
    expect(mockSocket.off).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it("drops stale sequence payloads", async () => {
    const { result } = renderHook(() =>
      useLiveBusTracking({
        socketUrl: "http://localhost:3000",
        socketEvent: "bus_location_update",
      })
    );

    await act(async () => {
      handlers.connect?.();
    });

    await act(async () => {
      handlers.bus_location_update?.({
        bus_id: 101,
        latitude: 28.6139,
        longitude: 77.209,
        seq: 10,
      });
    });

    await act(async () => {
      handlers.bus_location_update?.({
        bus_id: 101,
        latitude: 28.61395,
        longitude: 77.2091,
        seq: 9,
      });
    });

    expect(result.current.positionsByBusId[101].seq).toBe(10);
  });
});
