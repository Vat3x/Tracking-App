import nativeAuth from "@react-native-firebase/auth";
import type { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { signInWithCustomToken as jsSignInWithCustomToken } from "firebase/auth";
import { app, auth } from "./firebase";

const functions = getFunctions(app);

export async function checkPhoneRegistered(phoneNumber: string): Promise<boolean> {
  const check = httpsCallable<{ phone: string }, { exists: boolean }>(functions, "checkPhoneExists");
  const result = await check({ phone: phoneNumber });
  return result.data.exists;
}

export async function sendVerificationCode(phoneNumber: string): Promise<string | null> {
  const sendOtp = httpsCallable<{ phone: string }, { success: boolean; requestId?: string }>(functions, "sendOtp");
  const result = await sendOtp({ phone: phoneNumber });
  return result.data.requestId ?? null;
}

export async function verifyOtpAndSignIn(
  phoneNumber: string,
  otpCode: string,
  requestId?: string | null
): Promise<FirebaseAuthTypes.User> {
  const verifyOtp = httpsCallable<
    { phone: string; code: string; requestId?: string },
    { customToken: string }
  >(functions, "verifyOtp");

  const result = await verifyOtp({ phone: phoneNumber, code: otpCode, requestId: requestId ?? undefined });
  const { customToken } = result.data;

  await jsSignInWithCustomToken(auth, customToken);
  const credential = await nativeAuth().signInWithCustomToken(customToken);
  return credential.user;
}

export async function createPhoneUser(
  uid: string,
  phoneNumber: string,
  displayName: string
): Promise<void> {
  const createDoc = httpsCallable(functions, "createDriverDoc");
  await createDoc({ uid, phone: phoneNumber, displayName });
}
