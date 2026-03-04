import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS, type Trip, type GeoPoint, type TripStatus } from "@nexus/shared";

export interface CreateTripInput {
  companyId: string;
  driverId: string;
  assignedBy: string;
  origin: GeoPoint;
  destination: GeoPoint;
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
    destination: input.destination,
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
