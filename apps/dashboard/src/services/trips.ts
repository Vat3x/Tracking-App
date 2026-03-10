import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteField,
  query,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS, type Trip, type GeoPoint, type TripStatus } from "@nexus/shared";
export type { GeoPoint };

export interface CreateTripInput {
  companyId: string;
  driverId: string;
  assignedBy: string;
  origin: GeoPoint;
  stops?: GeoPoint[];
  destination?: GeoPoint;
  country?: string;
}

export async function createTrip(input: CreateTripInput): Promise<string> {
  const tripRef = doc(collection(db, COLLECTIONS.TRIPS));

  const trip: Omit<Trip, "id"> = {
    companyId: input.companyId,
    driverId: input.driverId,
    assignedBy: input.assignedBy,
    status: "pending",
    origin: input.origin,
    ...(input.stops && input.stops.length > 0 && { stops: input.stops }),
    ...(input.destination && { destination: input.destination }),
    ...(input.country && { country: input.country }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    respondedAt: null,
  };

  await setDoc(tripRef, trip);
  return tripRef.id;
}

export async function updateTripStatus(
  tripId: string,
  status: TripStatus
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.TRIPS, tripId), {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateTripLocation(
  tripId: string,
  field: "origin" | "destination",
  location: GeoPoint
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.TRIPS, tripId), {
    [field]: location,
    updatedAt: Date.now(),
  });
}

export async function updateTripStop(
  tripId: string,
  stops: GeoPoint[]
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.TRIPS, tripId), {
    stops,
    updatedAt: Date.now(),
  });
}

export async function updateTripRoute(
  tripId: string,
  origin: GeoPoint,
  stops: GeoPoint[],
  destination: GeoPoint | null
): Promise<void> {
  const update: Record<string, unknown> = {
    origin,
    updatedAt: Date.now(),
  };
  if (stops.length > 0) {
    update.stops = stops;
  } else {
    update.stops = deleteField();
  }
  if (destination) {
    update.destination = destination;
  } else {
    update.destination = deleteField();
  }
  await updateDoc(doc(db, COLLECTIONS.TRIPS, tripId), update);
}

export function subscribeToCompanyTrips(
  companyId: string,
  callback: (trips: Trip[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.TRIPS),
    where("companyId", "==", companyId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const trips = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as Trip
    );
    callback(trips);
  });
}
