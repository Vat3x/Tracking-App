import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS, type Invite } from "@nexus/shared";

export async function getInvite(inviteId: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.INVITES, inviteId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Invite;
}

export async function acceptInvite(
  inviteId: string,
  driverId: string
): Promise<void> {
  // Mark invite as accepted — the Cloud Function handles the rest
  // (linking driver to company, adding to members, etc.)
  await updateDoc(doc(db, COLLECTIONS.INVITES, inviteId), {
    status: "accepted",
    acceptedBy: driverId,
  });
}
