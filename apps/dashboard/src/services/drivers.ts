import { collection, query, where, getDocs, doc, updateDoc, writeBatch } from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { db, rtdb } from "./firebase";
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
 */
export async function updateDriverName(
  driverId: string,
  displayName: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.USERS, driverId), { displayName });
}

/**
 * Remove a driver from a company.
 * Clears their companyId, removes from company members, and removes RTDB entries.
 */
export async function removeDriverFromCompany(
  driverId: string,
  companyId: string
): Promise<void> {
  const batch = writeBatch(db);

  // 1. Clear companyId on user doc
  batch.update(doc(db, COLLECTIONS.USERS, driverId), { companyId: null });

  // 2. Remove from company members subcollection
  batch.delete(doc(db, COLLECTIONS.members(companyId), driverId));

  await batch.commit();

  // 3. Remove from RTDB company_members
  await remove(ref(rtdb, `company_members/${companyId}/${driverId}`));

  // 4. Remove location data from RTDB
  await remove(ref(rtdb, `locations/${companyId}/${driverId}`));
}
