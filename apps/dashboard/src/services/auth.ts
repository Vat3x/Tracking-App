import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  deleteUser,
  sendEmailVerification,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  collection,
} from "firebase/firestore";
import { ref, set } from "firebase/database";
import { auth, db, rtdb } from "./firebase";
import { COLLECTIONS, type User, type Company, DEFAULT_COMPANY_SETTINGS } from "@nexus/shared";

export async function registerDispatcher(
  email: string,
  password: string,
  displayName: string,
  companyName: string
): Promise<{ user: FirebaseUser; companyId: string }> {
  // 1. Create Firebase Auth user
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  try {
    // 2. Create company document
    const companyRef = doc(collection(db, COLLECTIONS.COMPANIES));
    const companyId = companyRef.id;

    const company: Omit<Company, "id"> = {
      name: companyName,
      ownerId: uid,
      createdAt: Date.now(),
      settings: DEFAULT_COMPANY_SETTINGS,
    };
    await setDoc(companyRef, company);

    // 3. Add dispatcher as company member
    await setDoc(doc(db, COLLECTIONS.members(companyId), uid), {
      userId: uid,
      role: "admin",
      joinedAt: Date.now(),
    });

    // 4. Mirror to RTDB for security rules (so dispatcher can read locations)
    await set(ref(rtdb, `company_members/${companyId}/${uid}`), true);

    // 5. Create user document
    const userData: Omit<User, "id"> = {
      email,
      displayName,
      role: "dispatcher",
      companyId,
      fcmToken: null,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, COLLECTIONS.USERS, uid), userData);

    // 6. Send verification email
    await sendEmailVerification(credential.user);

    return { user: credential.user, companyId };
  } catch (err) {
    // Clean up auth user so the email isn't stuck in a broken state
    try { await deleteUser(credential.user); } catch {}
    throw err;
  }
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

export async function resendVerificationEmail(): Promise<void> {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

export { auth };

export async function getUserDoc(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as User;
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}
