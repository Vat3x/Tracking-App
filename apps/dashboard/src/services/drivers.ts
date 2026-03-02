import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";
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
