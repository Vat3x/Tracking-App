import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS, type Trip, type TripStatus } from "@nexus/shared";

/**
 * Subscribe to trips assigned to this driver.
 */
export function subscribeToDriverTrips(
  driverId: string,
  callback: (trips: Trip[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.TRIPS),
    where("driverId", "==", driverId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const trips = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Trip
      );
      callback(trips);
    },
    (error) => {
      console.error("subscribeToDriverTrips error:", error);
      // Still call callback with empty array so UI stops loading
      callback([]);
    }
  );
}

/**
 * Driver responds to a trip (accept/reject) or updates status.
 */
export async function respondToTrip(
  tripId: string,
  status: TripStatus
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.TRIPS, tripId), {
    status,
    respondedAt: Date.now(),
    updatedAt: Date.now(),
  });
}
