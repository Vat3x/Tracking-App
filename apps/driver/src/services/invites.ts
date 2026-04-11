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
  const acceptInviteCall = httpsCallable(functions, "acceptInviteCall");
  await acceptInviteCall({ inviteId, driverId });
}
