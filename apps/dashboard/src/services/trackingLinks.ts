import {
  collection,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS, TRACKING_LINK_EXPIRY_DAYS } from "@nexus/shared";

export function generateTrackingUrl(linkId: string): string {
  return `https://tracking.load-mind.com/track/${linkId}`;
}

/**
 * Generates a tracking link UUID and URL synchronously (for immediate clipboard copy),
 * then persists to Firestore in the background.
 */
export function createTrackingLink(
  tripId: string,
  companyId: string,
  driverId: string,
  createdBy: string
): { linkId: string; url: string; saved: Promise<void> } {
  const linkId = crypto.randomUUID();
  const url = generateTrackingUrl(linkId);
  const now = Date.now();
  const ref = doc(collection(db, COLLECTIONS.TRACKING_LINKS));

  const saved = setDoc(ref, {
    linkId,
    tripId,
    companyId,
    driverId,
    createdBy,
    createdAt: now,
    expiresAt: now + TRACKING_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    active: true,
  });

  return { linkId, url, saved };
}
