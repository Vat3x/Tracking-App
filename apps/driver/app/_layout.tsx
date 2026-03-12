import { useEffect, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { onAuthChange, getUserDoc } from "../src/services/auth";
import { useAuthStore } from "../src/stores/auth";
import {
  registerForPushNotifications,
  setupNotificationListeners,
  checkInitialNotification,
} from "../src/services/notifications";
import { startNetworkListener } from "../src/services/offlineQueue";
import { SplashScreen } from "../src/components/SplashScreen";

const queryClient = new QueryClient();

function extractInviteId(url: string): string | null {
  // Handle both https://tracking-app-f6ad7.web.app/invite/{id} and nexustracking://invite/{id}
  const match = url.match(/\/invite\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { firebaseUser, loading, setFirebaseUser, setUserDoc, setLoading } =
    useAuthStore();

  // Handle auth state
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

  // Initialize push notifications when authenticated
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    let cleanupListeners: (() => void) | undefined;

    async function init() {
      try {
        await registerForPushNotifications(firebaseUser!.uid);
      } catch (err) {
        console.error("Push notification registration failed:", err);
      }
      cleanupListeners = setupNotificationListeners(firebaseUser!.uid);
      // Check if app was launched by tapping a notification
      await checkInitialNotification();
    }

    init();

    return () => {
      cleanupListeners?.();
    };
  }, [firebaseUser?.uid]);

  // Monitor network connectivity for offline queue
  useEffect(() => {
    return startNetworkListener();
  }, []);

  // Handle deep links
  useEffect(() => {
    function handleDeepLink(event: { url: string }) {
      const inviteId = extractInviteId(event.url);
      if (inviteId) {
        router.push({
          pathname: "/(auth)/accept-invite",
          params: { id: inviteId },
        });
      }
    }

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    // Listen for deep links while app is open
    const sub = Linking.addEventListener("url", handleDeepLink);
    return () => sub.remove();
  }, [router]);

  // Auth-based routing
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    // Don't redirect away from accept-invite screen
    const onAcceptInvite = (segments as string[])[1] === "accept-invite";

    if (!firebaseUser && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (firebaseUser && inAuthGroup && !onAcceptInvite) {
      router.replace("/(main)/home");
    }
  }, [firebaseUser, loading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <AuthGate />
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </QueryClientProvider>
  );
}
