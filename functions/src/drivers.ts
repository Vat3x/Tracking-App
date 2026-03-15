import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const rtdb = admin.database();

/**
 * HTTP function to remove a driver from a company.
 * Uses onRequest (not onCall) to avoid Cloud Run invoker CORS issues.
 * Validates caller via Bearer token, then:
 * 1. Clears companyId on driver's user doc
 * 2. Removes from company members subcollection
 * 3. Removes from RTDB company_members
 * 4. Removes RTDB location data
 */
export const removeDriver = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Verify auth token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let callerId: string;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
    callerId = decoded.uid;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const { driverId, companyId } = req.body;
  if (!driverId || !companyId) {
    res.status(400).json({ error: "Missing driverId or companyId" });
    return;
  }

  // Verify caller is a company member
  const memberDoc = await firestore.doc(`companies/${companyId}/members/${callerId}`).get();
  if (!memberDoc.exists) {
    res.status(403).json({ error: "Not a company member" });
    return;
  }

  // Check if driver exists in Firestore
  const driverDoc = await firestore.doc(`users/${driverId}`).get();
  const hasFirestoreDoc = driverDoc.exists && driverDoc.data()?.companyId === companyId;

  if (hasFirestoreDoc) {
    // Atomic Firestore updates
    const batch = firestore.batch();
    batch.update(firestore.doc(`users/${driverId}`), { companyId: null });
    batch.delete(firestore.doc(`companies/${companyId}/members/${driverId}`));
    await batch.commit();
  }

  // Clean up RTDB (always — handles orphan entries with no Firestore doc)
  await rtdb.ref(`company_members/${companyId}/${driverId}`).remove();
  await rtdb.ref(`locations/${companyId}/${driverId}`).remove();

  console.log(`removeDriver: Driver ${driverId} removed from company ${companyId} by ${callerId}`);
  res.json({ success: true });
});
