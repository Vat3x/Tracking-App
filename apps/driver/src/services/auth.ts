import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { COLLECTIONS, type User } from "@nexus/shared";

export async function registerDriver(
  email: string,
  password: string,
  displayName: string
): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  const userData: Omit<User, "id"> = {
    email,
    displayName,
    role: "driver",
    companyId: null,
    fcmToken: null,
    createdAt: Date.now(),
  };
  await setDoc(doc(db, COLLECTIONS.USERS, uid), userData);

  return credential.user;
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

const FUNCTIONS_URL = "https://us-central1-tracking-app-f6ad7.cloudfunctions.net";

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  const res = await fetch(`${FUNCTIONS_URL}/deleteAccount`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to delete account");
  }

  await signOut(auth);
}

export async function getUserDoc(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as User;
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export function onUserDocChange(uid: string, callback: (user: User | null) => void) {
  return onSnapshot(doc(db, COLLECTIONS.USERS, uid), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ id: snap.id, ...snap.data() } as User);
  });
}
