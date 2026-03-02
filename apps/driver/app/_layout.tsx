import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onAuthChange, getUserDoc } from "../src/services/auth";
import { useAuthStore } from "../src/stores/auth";

const queryClient = new QueryClient();

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { firebaseUser, loading, setFirebaseUser, setUserDoc, setLoading } =
    useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        setFirebaseUser({ uid: user.uid, email: user.email });
        const userDoc = await getUserDoc(user.uid);
        setUserDoc(userDoc);
      } else {
        setFirebaseUser(null);
        setUserDoc(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setFirebaseUser, setUserDoc, setLoading]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!firebaseUser && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (firebaseUser && inAuthGroup) {
      router.replace("/(main)/home");
    }
  }, [firebaseUser, loading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <AuthGate />
    </QueryClientProvider>
  );
}
