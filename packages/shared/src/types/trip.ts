export type TripStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface GeoPoint {
  label: string;
  lat: number;
  lng: number;
  zipCode?: string;
}

export interface TripStop {
  type: "pickup" | "dropoff";
  label: string;
  lat: number;
  lng: number;
  zipCode?: string;
  note?: string;
}

export interface Trip {
  id: string;
  companyId: string;
  driverId: string | null;
  assignedBy: string;
  status: TripStatus;
  stops: TripStop[];
  /** @deprecated Legacy field — use stops[] */
  origin?: GeoPoint;
  /** @deprecated Legacy field — use stops[] */
  destination?: GeoPoint;
  country?: string;
  currentStopIndex?: number;
  createdAt: number;
  updatedAt: number;
  respondedAt: number | null;
}

/** Convert any trip (old or new format) to a TripStop[] */
export function getStopsFromTrip(trip: Trip): TripStop[] {
  // New format: stops with type field
  if (trip.stops?.length && "type" in trip.stops[0]) {
    return trip.stops;
  }
  // Legacy format: origin + untyped stops + destination
  const result: TripStop[] = [];
  const legacy = trip as any;
  if (legacy.origin) {
    const o = legacy.origin as GeoPoint;
    result.push({ type: "pickup", label: o.label, lat: o.lat, lng: o.lng, zipCode: o.zipCode });
  }
  if (trip.stops?.length && !("type" in trip.stops[0])) {
    for (const s of trip.stops as unknown as GeoPoint[]) {
      result.push({ type: "pickup", label: s.label, lat: s.lat, lng: s.lng, zipCode: s.zipCode });
    }
  }
  if (legacy.destination) {
    const d = legacy.destination as GeoPoint;
    result.push({ type: "dropoff", label: d.label, lat: d.lat, lng: d.lng, zipCode: d.zipCode });
  }
  return result;
}

export function getFirstPickup(trip: Trip): TripStop | undefined {
  return getStopsFromTrip(trip).find((s) => s.type === "pickup");
}

export function getLastDropoff(trip: Trip): TripStop | undefined {
  const stops = getStopsFromTrip(trip);
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].type === "dropoff") return stops[i];
  }
  return undefined;
}

export function getTripRouteLabel(trip: Trip): string {
  const stops = getStopsFromTrip(trip);
  if (stops.length === 0) return "No stops";
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (stops.length === 1) return first.label;
  return `${first.label} → ${last.label}`;
}
