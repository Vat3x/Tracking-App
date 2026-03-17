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

/**
 * HTTP function for a driver to delete their own account.
 * Validates caller via Bearer token, then:
 * 1. Cancels any active trips
 * 2. Deletes Firestore user doc + company member doc
 * 3. Removes RTDB company_members + location data
 * 4. Deletes Firebase Auth user
 */
export const deleteAccount = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]);
    uid = decoded.uid;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // Get user doc to find companyId
  const userDoc = await firestore.doc(`users/${uid}`).get();
  if (!userDoc.exists) {
    // User doc gone but auth exists — just delete auth
    await admin.auth().deleteUser(uid);
    res.json({ success: true });
    return;
  }

  const userData = userDoc.data()!;
  const companyId = userData.companyId as string | null;

  // Cancel active trips for this driver
  const activeStatuses = ["pending", "accepted", "in_progress"];
  const tripsSnap = await firestore
    .collection("trips")
    .where("driverId", "==", uid)
    .where("status", "in", activeStatuses)
    .get();

  if (!tripsSnap.empty) {
    const batch = firestore.batch();
    for (const tripDoc of tripsSnap.docs) {
      batch.update(tripDoc.ref, { status: "cancelled" });
    }
    await batch.commit();
  }

  // Delete Firestore data
  const deleteBatch = firestore.batch();
  deleteBatch.delete(firestore.doc(`users/${uid}`));
  if (companyId) {
    deleteBatch.delete(firestore.doc(`companies/${companyId}/members/${uid}`));
  }
  await deleteBatch.commit();

  // Clean up RTDB
  if (companyId) {
    await rtdb.ref(`company_members/${companyId}/${uid}`).remove();
    await rtdb.ref(`locations/${companyId}/${uid}`).remove();
  }

  // Delete Firebase Auth user
  await admin.auth().deleteUser(uid);

  console.log(`deleteAccount: User ${uid} deleted their account`);
  res.json({ success: true });
});
