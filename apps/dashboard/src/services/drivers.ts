import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { COLLECTIONS, type User, firebaseConfig } from "@nexus/shared";

const FUNCTIONS_URL = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

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
 * Remove a driver from a company via Cloud Function (onRequest).
 * Uses fetch with Bearer token auth to avoid Cloud Run CORS issues.
 */
export async function removeDriverFromCompany(
  driverId: string,
  companyId: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  const res = await fetch(`${FUNCTIONS_URL}/removeDriver`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ driverId, companyId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to remove driver");
  }
}
