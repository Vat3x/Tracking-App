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
import { COLLECTIONS, type Trip, type TripStop, type TripStatus } from "@nexus/shared";

export interface CreateTripInput {
  companyId: string;
  driverId: string;
  assignedBy: string;
  stops: TripStop[];
  country?: string;
}

export async function createTrip(input: CreateTripInput): Promise<string> {
  const tripRef = doc(collection(db, COLLECTIONS.TRIPS));

  const trip = {
    companyId: input.companyId,
    driverId: input.driverId,
    assignedBy: input.assignedBy,
    status: "pending",
    stops: input.stops,
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

export async function updateTripRoute(
  tripId: string,
  stops: TripStop[]
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.TRIPS, tripId), {
    stops,
    // Clean up legacy fields
    origin: deleteField(),
    destination: deleteField(),
    updatedAt: Date.now(),
  });
}

export async function updateTripLocation(
  tripId: string,
  field: "origin" | "destination",
  location: { label: string; lat: number; lng: number; zipCode?: string }
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.TRIPS, tripId), {
    [field]: location,
    updatedAt: Date.now(),
  });
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

export function subscribeToDriverTrips(
  driverId: string,
  callback: (trips: Trip[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.TRIPS),
    where("driverId", "==", driverId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const trips = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as Trip
    );
    callback(trips);
  });
}
