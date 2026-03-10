import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { COLLECTIONS, type User } from "@nexus/shared";

/**
 * Fetch all driver users belonging to a company.
 * Returns a map of userId → User for quick lookup.
 */
export async function getCompanyDrivers(
  companyId: string
): Promise<Map<string, User>> {
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where("companyId", "==", companyId),
    where("role", "==", "driver")
  );
  const snap = await getDocs(q);
  const map = new Map<string, User>();
  snap.forEach((doc) => {
    map.set(doc.id, { id: doc.id, ...doc.data() } as User);
  });
  return map;
}

/**
 * Update a driver's display name.
 * Firestore rules allow company members to update displayName/phone on users in their company.
 */
export async function updateDriverName(
  driverId: string,
  displayName: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.USERS, driverId), { displayName });
}

/**
 * Remove a driver from a company via Cloud Function.
 * The function validates permissions server-side, then clears companyId,
 * removes from company members, and cleans up RTDB entries.
 */
export async function removeDriverFromCompany(
  driverId: string,
  companyId: string
): Promise<void> {
  const fn = httpsCallable(functions, "removeDriver");
  await fn({ driverId, companyId });
}
