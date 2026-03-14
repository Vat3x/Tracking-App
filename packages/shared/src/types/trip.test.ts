import { describe, it, expect } from "vitest";
import {
  getStopsFromTrip,
  getFirstPickup,
  getLastDropoff,
  getTripRouteLabel,
  type Trip,
  type TripStop,
  type GeoPoint,
} from "./trip";

// ── Helpers ──

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    companyId: "comp-1",
    driverId: "driver-1",
    assignedBy: "dispatcher-1",
    status: "pending",
    stops: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    respondedAt: null,
    ...overrides,
  };
}

function makeStop(overrides: Partial<TripStop> = {}): TripStop {
  return {
    type: "pickup",
    label: "Test Location",
    lat: 40.7128,
    lng: -74.006,
    ...overrides,
  };
}

// ── Tests ──

describe("getStopsFromTrip", () => {
  it("returns stops[] directly for new format trips", () => {
    const stops: TripStop[] = [
      makeStop({ type: "pickup", label: "Warehouse A" }),
      makeStop({ type: "dropoff", label: "Customer B", lat: 41.0, lng: -75.0 }),
    ];
    const trip = makeTrip({ stops });

    const result = getStopsFromTrip(trip);
    expect(result).toEqual(stops);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("pickup");
    expect(result[1].type).toBe("dropoff");
  });

  it("returns empty array for trip with no stops and no legacy fields", () => {
    const trip = makeTrip({ stops: [] });
    expect(getStopsFromTrip(trip)).toEqual([]);
  });

  it("handles single pickup stop", () => {
    const trip = makeTrip({
      stops: [makeStop({ type: "pickup", label: "Only Pickup" })],
    });

    const result = getStopsFromTrip(trip);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Only Pickup");
    expect(result[0].type).toBe("pickup");
  });

  it("handles many stops (multi-stop trip)", () => {
    const stops: TripStop[] = [
      makeStop({ type: "pickup", label: "Pickup 1" }),
      makeStop({ type: "pickup", label: "Pickup 2", lat: 41.0 }),
      makeStop({ type: "dropoff", label: "Drop 1", lat: 42.0 }),
      makeStop({ type: "dropoff", label: "Drop 2", lat: 43.0 }),
      makeStop({ type: "dropoff", label: "Drop 3", lat: 44.0 }),
    ];
    const trip = makeTrip({ stops });

    const result = getStopsFromTrip(trip);
    expect(result).toHaveLength(5);
    expect(result.filter((s) => s.type === "pickup")).toHaveLength(2);
    expect(result.filter((s) => s.type === "dropoff")).toHaveLength(3);
  });

  it("preserves zipCode and note fields", () => {
    const stops: TripStop[] = [
      makeStop({ type: "pickup", label: "A", zipCode: "10001", note: "Ring bell" }),
      makeStop({ type: "dropoff", label: "B", zipCode: "90210" }),
    ];
    const trip = makeTrip({ stops });

    const result = getStopsFromTrip(trip);
    expect(result[0].zipCode).toBe("10001");
    expect(result[0].note).toBe("Ring bell");
    expect(result[1].zipCode).toBe("90210");
    expect(result[1].note).toBeUndefined();
  });

  // ── Legacy format backward compatibility ──

  it("converts legacy origin/destination to typed stops", () => {
    const trip = makeTrip({ stops: [] }) as any;
    trip.origin = { label: "Origin City", lat: 40.0, lng: -74.0, zipCode: "10001" } as GeoPoint;
    trip.destination = { label: "Dest City", lat: 42.0, lng: -76.0, zipCode: "20002" } as GeoPoint;

    const result = getStopsFromTrip(trip as Trip);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: "pickup",
      label: "Origin City",
      lat: 40.0,
      lng: -74.0,
      zipCode: "10001",
    });
    expect(result[1]).toEqual({
      type: "dropoff",
      label: "Dest City",
      lat: 42.0,
      lng: -76.0,
      zipCode: "20002",
    });
  });

  it("converts legacy origin-only trip (no destination)", () => {
    const trip = makeTrip({ stops: [] }) as any;
    trip.origin = { label: "Pickup Only", lat: 40.0, lng: -74.0 } as GeoPoint;

    const result = getStopsFromTrip(trip as Trip);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("pickup");
    expect(result[0].label).toBe("Pickup Only");
  });

  it("converts legacy format with untyped intermediate stops", () => {
    const trip = makeTrip({
      stops: [
        { label: "Mid Stop", lat: 41.0, lng: -75.0 } as any,
      ],
    }) as any;
    trip.origin = { label: "Start", lat: 40.0, lng: -74.0 } as GeoPoint;
    trip.destination = { label: "End", lat: 42.0, lng: -76.0 } as GeoPoint;

    const result = getStopsFromTrip(trip as Trip);
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe("Start");
    expect(result[1].label).toBe("Mid Stop");
    expect(result[2].label).toBe("End");
  });
});

describe("getFirstPickup", () => {
  it("returns first pickup stop", () => {
    const trip = makeTrip({
      stops: [
        makeStop({ type: "pickup", label: "First Pickup" }),
        makeStop({ type: "dropoff", label: "Dropoff" }),
      ],
    });

    const result = getFirstPickup(trip);
    expect(result?.label).toBe("First Pickup");
    expect(result?.type).toBe("pickup");
  });

  it("returns undefined when no stops", () => {
    const trip = makeTrip({ stops: [] });
    expect(getFirstPickup(trip)).toBeUndefined();
  });

  it("skips dropoffs and finds first pickup", () => {
    const trip = makeTrip({
      stops: [
        makeStop({ type: "dropoff", label: "Drop First" }),
        makeStop({ type: "pickup", label: "Pickup After" }),
      ],
    });

    expect(getFirstPickup(trip)?.label).toBe("Pickup After");
  });
});

describe("getLastDropoff", () => {
  it("returns last dropoff stop", () => {
    const trip = makeTrip({
      stops: [
        makeStop({ type: "pickup", label: "Pickup" }),
        makeStop({ type: "dropoff", label: "Drop 1" }),
        makeStop({ type: "dropoff", label: "Drop 2" }),
      ],
    });

    expect(getLastDropoff(trip)?.label).toBe("Drop 2");
  });

  it("returns undefined when no dropoffs", () => {
    const trip = makeTrip({
      stops: [makeStop({ type: "pickup", label: "Only Pickup" })],
    });

    expect(getLastDropoff(trip)).toBeUndefined();
  });

  it("returns undefined when no stops", () => {
    const trip = makeTrip({ stops: [] });
    expect(getLastDropoff(trip)).toBeUndefined();
  });
});

describe("getTripRouteLabel", () => {
  it("returns 'first → last' for multi-stop trip", () => {
    const trip = makeTrip({
      stops: [
        makeStop({ type: "pickup", label: "Atlanta, GA" }),
        makeStop({ type: "dropoff", label: "Miami, FL" }),
      ],
    });

    expect(getTripRouteLabel(trip)).toBe("Atlanta, GA → Miami, FL");
  });

  it("returns single label for one-stop trip", () => {
    const trip = makeTrip({
      stops: [makeStop({ type: "pickup", label: "Chicago, IL" })],
    });

    expect(getTripRouteLabel(trip)).toBe("Chicago, IL");
  });

  it("returns 'No stops' for empty trip", () => {
    const trip = makeTrip({ stops: [] });
    expect(getTripRouteLabel(trip)).toBe("No stops");
  });

  it("shows first and last for 5-stop trip", () => {
    const trip = makeTrip({
      stops: [
        makeStop({ type: "pickup", label: "Start" }),
        makeStop({ type: "pickup", label: "Mid 1" }),
        makeStop({ type: "dropoff", label: "Mid 2" }),
        makeStop({ type: "dropoff", label: "Mid 3" }),
        makeStop({ type: "dropoff", label: "Final" }),
      ],
    });

    expect(getTripRouteLabel(trip)).toBe("Start → Final");
  });
});
