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
  batch.set(userRef, { companyId, ...(companyName ? { companyName } : {}) }, { merge: true });

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
