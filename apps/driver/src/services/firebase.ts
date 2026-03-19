import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { firebaseConfig } from "@nexus/shared";

const app = initializeApp(firebaseConfig);

// initializeAuth may fail if @react-native-firebase/auth native SDK
// already initialized auth — fall back to getAuth() in that case
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  auth = getAuth(app);
}
export { auth };
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
