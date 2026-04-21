import nativeAuth from "@react-native-firebase/auth";
import type { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { signInWithEmailAndPassword } from "firebase/auth";
import { db, app, auth } from "./firebase";
import { COLLECTIONS, type User } from "@nexus/shared";

const functions = getFunctions(app);

type FirebaseUser = FirebaseAuthTypes.User;

export async function registerDriver(
  email: string,
  password: string,
  displayName: string
): Promise<FirebaseUser> {
  const credential = await nativeAuth().createUserWithEmailAndPassword(email, password);
  const uid = credential.user.uid;

  // Sign in JS SDK too — needed for Firestore reads (security rules check JS SDK auth)
  await signInWithEmailAndPassword(auth, email, password);

  const createDoc = httpsCallable(functions, "createDriverDoc");
  await createDoc({ uid, email, displayName });

  return credential.user;
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<FirebaseUser> {
  // Sign in both native SDK (for Auth state) and JS SDK (for Firestore reads)
  const [credential] = await Promise.all([
    nativeAuth().signInWithEmailAndPassword(email, password),
    signInWithEmailAndPassword(auth, email, password),
  ]);
  return credential.user;
}

export async function resetPassword(email: string): Promise<void> {
  const functions = getFunctions(app);
  const sendPasswordReset = httpsCallable(functions, "sendPasswordReset");
  await sendPasswordReset({ email });
}

export async function logout(): Promise<void> {
  await nativeAuth().signOut();
}

const FUNCTIONS_URL = "https://us-central1-tracking-app-f6ad7.cloudfunctions.net";

export async function deleteAccount(): Promise<void> {
  const user = nativeAuth().currentUser;
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

  await nativeAuth().signOut();
}

export async function getUserDoc(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as User;
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return nativeAuth().onAuthStateChanged(callback);
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
