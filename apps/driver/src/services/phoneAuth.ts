import {
  PhoneAuthProvider,
  signInWithCredential,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { COLLECTIONS, type User } from "@nexus/shared";
import nativeAuth from "@react-native-firebase/auth";

// ---------------------------------------------------------------------------
// Send verification code using native SDK (Play Integrity + reCAPTCHA fallback)
// signInWithPhoneNumber handles the full Android flow gracefully, including
// reCAPTCHA fallback for debug/sideloaded builds.
// ---------------------------------------------------------------------------

export async function sendVerificationCode(
  phoneNumber: string
): Promise<string> {
  const confirmation = await nativeAuth().signInWithPhoneNumber(phoneNumber);
  return confirmation.verificationId;
}

// ---------------------------------------------------------------------------
// Phone OTP verification — runs on the React Native side (Firebase JS SDK)
// ---------------------------------------------------------------------------

export async function verifyOtpAndSignIn(
  verificationId: string,
  otpCode: string
): Promise<FirebaseUser> {
  const credential = PhoneAuthProvider.credential(verificationId, otpCode);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

// ---------------------------------------------------------------------------
// Create Firestore user doc for new phone-auth users
// ---------------------------------------------------------------------------

export async function createPhoneUser(
  uid: string,
  phoneNumber: string,
  displayName: string
): Promise<void> {
  const userData: Omit<User, "id"> = {
    phone: phoneNumber,
    displayName,
    role: "driver",
    companyId: null,
    fcmToken: null,
    createdAt: Date.now(),
  };
  await setDoc(doc(db, COLLECTIONS.USERS, uid), userData);
}
