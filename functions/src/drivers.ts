import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const rtdb = admin.database();

/**
 * Callable function to remove a driver from a company.
 * Validates caller is a company member, then:
 * 1. Clears companyId on driver's user doc
 * 2. Removes from company members subcollection
 * 3. Removes from RTDB company_members
 * 4. Removes RTDB location data
 */
export const removeDriver = onCall(async (request) => {
  const callerId = request.auth?.uid;
  if (!callerId) {
    throw new HttpsError("unauthenticated", "Must be authenticated");
  }

  const { driverId, companyId } = request.data as { driverId?: string; companyId?: string };
  if (!driverId || !companyId) {
    throw new HttpsError("invalid-argument", "Missing driverId or companyId");
  }

  // Verify caller is a company member
  const memberDoc = await firestore.doc(`companies/${companyId}/members/${callerId}`).get();
  if (!memberDoc.exists) {
    throw new HttpsError("permission-denied", "Not a company member");
  }

  // Verify driver belongs to this company
  const driverDoc = await firestore.doc(`users/${driverId}`).get();
  if (!driverDoc.exists || driverDoc.data()?.companyId !== companyId) {
    throw new HttpsError("not-found", "Driver not found in company");
  }

  // Atomic Firestore updates
  const batch = firestore.batch();
  batch.update(firestore.doc(`users/${driverId}`), { companyId: null });
  batch.delete(firestore.doc(`companies/${companyId}/members/${driverId}`));
  await batch.commit();

  // Clean up RTDB
  await rtdb.ref(`company_members/${companyId}/${driverId}`).remove();
  await rtdb.ref(`locations/${companyId}/${driverId}`).remove();

  console.log(`removeDriver: Driver ${driverId} removed from company ${companyId} by ${callerId}`);
  return { success: true };
});
