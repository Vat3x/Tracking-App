import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

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

  const { companyId, acceptedBy } = after;
  if (!companyId || !acceptedBy) return;

  const batch = firestore.batch();

  // 1. Update driver's user doc with companyId
  const userRef = firestore.doc(`users/${acceptedBy}`);
  batch.update(userRef, { companyId });

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
