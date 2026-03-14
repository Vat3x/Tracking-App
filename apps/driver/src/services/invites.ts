import { doc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";
import { COLLECTIONS, type Invite } from "@nexus/shared";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "@nexus/shared";

const app = getApps()[0] || initializeApp(firebaseConfig);
const functions = getFunctions(app);

export async function getInvite(inviteId: string): Promise<Invite | null> {
  const getInvitePublic = httpsCallable(functions, "getInvitePublic");
  const result = await getInvitePublic({ inviteId });
  return result.data as Invite;
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
