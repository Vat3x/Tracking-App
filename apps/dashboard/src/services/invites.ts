import {
  collection,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  COLLECTIONS,
  INVITE_EXPIRY_HOURS,
  type Invite,
} from "@nexus/shared";

export function generateInviteLink(inviteId: string): string {
  return `https://tracking.loadmind.app/invite/${inviteId}`;
}

export async function createInvite(
  companyId: string,
  companyName: string,
  createdBy: string
): Promise<Invite> {
  const ref = doc(collection(db, COLLECTIONS.INVITES));
  const now = Date.now();

  const invite: Omit<Invite, "id"> = {
    companyId,
    companyName,
    createdBy,
    createdAt: now,
    expiresAt: now + INVITE_EXPIRY_HOURS * 60 * 60 * 1000,
    status: "pending",
    acceptedBy: null,
  };

  await setDoc(ref, invite);
  return { id: ref.id, ...invite };
}

export function subscribeToInvites(
  companyId: string,
  callback: (invites: Invite[]) => void
) {
  const q = query(
    collection(db, COLLECTIONS.INVITES),
    where("companyId", "==", companyId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const invites = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Invite
    );
    callback(invites);
  });
}

export async function expireInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.INVITES, inviteId), {
    status: "expired",
  });
}
