import { describe, it, expect } from "vitest";
import { distanceMeters } from "./geo";

describe("distanceMeters", () => {
  it("returns 0 for same point", () => {
    expect(distanceMeters(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it("calculates NYC to LA (~3940 km)", () => {
    const nyc = { lat: 40.7128, lng: -74.006 };
    const la = { lat: 34.0522, lng: -118.2437 };
    const dist = distanceMeters(nyc.lat, nyc.lng, la.lat, la.lng);
    // ~3940 km ± 50 km
    expect(dist).toBeGreaterThan(3_890_000);
    expect(dist).toBeLessThan(3_990_000);
  });

  it("calculates short distance (~1.1 km)", () => {
    // Two points in Manhattan ~1.1 km apart
    const dist = distanceMeters(40.7484, -73.9857, 40.7580, -73.9855);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(1200);
  });

  it("handles equator crossing", () => {
    const dist = distanceMeters(1.0, 0, -1.0, 0);
    // ~222 km
    expect(dist).toBeGreaterThan(220_000);
    expect(dist).toBeLessThan(224_000);
  });

  it("handles antimeridian (180° longitude)", () => {
    const dist = distanceMeters(0, 179.5, 0, -179.5);
    // ~111 km
    expect(dist).toBeGreaterThan(100_000);
    expect(dist).toBeLessThan(120_000);
  });
});
