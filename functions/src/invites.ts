import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const rtdb = admin.database();

/**
 * When an invite status changes to "accepted", link the driver to the company:
 * 1. Update the driver's user doc with companyId
 * 2. Add the driver as a company member in Firestore
 * 3. Mirror the membership to RTDB (for security rules)
 */
export const onInviteAccepted = onDocumentUpdated("invites/{inviteId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  // Only proceed if status changed to "accepted"
  if (before.status === "accepted" || after.status !== "accepted") return;

  const { companyId, companyName, acceptedBy } = after;
  if (!companyId || !acceptedBy) return;

  const batch = firestore.batch();

  // 1. Update driver's user doc with companyId + companyName
  // Use set+merge so it works even if the user doc doesn't exist yet (phone auth edge case)
  const userRef = firestore.doc(`users/${acceptedBy}`);
  batch.set(userRef, { companyId, role: "driver", ...(companyName ? { companyName } : {}) }, { merge: true });

  // 2. Add driver as company member
  const memberRef = firestore.doc(`companies/${companyId}/members/${acceptedBy}`);
  batch.set(memberRef, {
    userId: acceptedBy,
    role: "driver",
    joinedAt: Date.now(),
  });

  await batch.commit();

  // 3. Mirror to RTDB for security rules
  await rtdb.ref(`company_members/${companyId}/${acceptedBy}`).set(true);
});

/**
 * Callable: accept an invite. Uses Admin SDK to bypass Firestore rules.
 * Called by the driver app after phone OTP sign-in.
 */
export const acceptInviteCall = onCall({ cors: true }, async (request) => {
  const { inviteId, driverId } = request.data as { inviteId: string; driverId: string };
  console.log("acceptInviteCall: called", { inviteId, driverId });
  if (!inviteId || !driverId) {
    throw new HttpsError("invalid-argument", "inviteId and driverId are required");
  }

  const inviteRef = firestore.doc(`invites/${inviteId}`);
  const snap = await inviteRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Invite not found");

  const data = snap.data()!;
  console.log("acceptInviteCall: invite data", { status: data.status, companyId: data.companyId });
  if (data.status !== "pending") {
    throw new HttpsError("failed-precondition", "Invite is no longer pending");
  }

  const { companyId, companyName } = data;

  // Update invite status
  await inviteRef.update({ status: "accepted", acceptedBy: driverId });
  console.log("acceptInviteCall: invite updated");

  // Link driver to company directly (don't rely on onInviteAccepted trigger)
  const batch = firestore.batch();
  batch.set(
    firestore.doc(`users/${driverId}`),
    { companyId, role: "driver", ...(companyName ? { companyName } : {}) },
    { merge: true }
  );
  batch.set(
    firestore.doc(`companies/${companyId}/members/${driverId}`),
    { userId: driverId, role: "driver", joinedAt: Date.now() }
  );
  await batch.commit();
  console.log("acceptInviteCall: driver linked to company", companyId);

  await rtdb.ref(`company_members/${companyId}/${driverId}`).set(true);
  console.log("acceptInviteCall: RTDB updated");

  return { success: true };
});

/**
 * Public callable: fetch invite data by ID (no auth required).
 * Uses Admin SDK to bypass Firestore security rules.
 */
export const getInvitePublic = onCall({ cors: true }, async (request) => {
  const inviteId = request.data?.inviteId;
  if (!inviteId || typeof inviteId !== "string") {
    throw new HttpsError("invalid-argument", "inviteId is required");
  }

  const snap = await firestore.doc(`invites/${inviteId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Invite not found");
  }

  const data = snap.data()!;
  return {
    id: snap.id,
    companyId: data.companyId,
    companyName: data.companyName,
    status: data.status,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
  };
});
