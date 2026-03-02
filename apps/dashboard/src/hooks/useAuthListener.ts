import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth";
import { onAuthChange, getUserDoc } from "@/services/auth";

export function useAuthListener() {
  const { setFirebaseUser, setUserDoc, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setFirebaseUser({ uid: firebaseUser.uid, email: firebaseUser.email });
        const userDoc = await getUserDoc(firebaseUser.uid);
        setUserDoc(userDoc);
      } else {
        setFirebaseUser(null);
        setUserDoc(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setFirebaseUser, setUserDoc, setLoading]);
}
