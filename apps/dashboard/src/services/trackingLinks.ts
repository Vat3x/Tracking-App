import {
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS, TRACKING_LINK_EXPIRY_DAYS } from "@nexus/shared";

export function generateTrackingUrl(linkId: string): string {
  return `https://tracking.loadmind.app/track/${linkId}`;
}

export async function createTrackingLink(
  tripId: string,
  companyId: string,
  driverId: string,
  createdBy: string
): Promise<string> {
  // Check if an active link already exists for this trip
  const existingSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.TRACKING_LINKS),
      where("tripId", "==", tripId),
      where("active", "==", true)
    )
  );

  if (!existingSnap.empty) {
    return existingSnap.docs[0].data().linkId;
  }

  const linkId = crypto.randomUUID();
  const now = Date.now();
  const ref = doc(collection(db, COLLECTIONS.TRACKING_LINKS));

  await setDoc(ref, {
    linkId,
    tripId,
    companyId,
    driverId,
    createdBy,
    createdAt: now,
    expiresAt: now + TRACKING_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    active: true,
  });

  return linkId;
}
