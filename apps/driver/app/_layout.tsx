import { useEffect, useRef, useState } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { onAuthChange, getUserDoc } from "../src/services/auth";
import { useAuthStore } from "../src/stores/auth";
import { useThemeStore } from "../src/stores/theme";
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

  // Track auth state for deep link handler (avoids stale closure)
  const firebaseUserRef = useRef(firebaseUser);
  firebaseUserRef.current = firebaseUser;

  // Handle deep links while app is already open (warm start)
  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      const inviteId = extractInviteId(event.url);
      if (inviteId) {
        if (firebaseUserRef.current) {
          // Authenticated: show consent screen
          router.push({
            pathname: "/(auth)/accept-invite",
            params: { id: inviteId },
          });
        } else {
          // Not authenticated: go directly to login with invite params
          router.replace({
            pathname: "/(auth)/login",
            params: { inviteId },
          });
        }
      }
    });
    return () => sub.remove();
  }, [router]);

  // Auth-based routing (handles cold start + invite links)
  const initialUrlProcessed = useRef(false);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const onAcceptInvite = (segments as string[])[1] === "accept-invite";

    if (!firebaseUser && !inAuthGroup) {
      if (!initialUrlProcessed.current) {
        initialUrlProcessed.current = true;
        // Check if cold-started via invite link
        Linking.getInitialURL().then((url) => {
          const invId = url ? extractInviteId(url) : null;
          if (invId) {
            router.replace({
              pathname: "/(auth)/login",
              params: { inviteId: invId },
            });
          } else {
            router.replace("/(auth)/login");
          }
        });
      } else {
        router.replace("/(auth)/login");
      }
    } else if (firebaseUser && inAuthGroup && !onAcceptInvite) {
      router.replace("/(main)/home");
    }
  }, [firebaseUser, loading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const isDark = useThemeStore((s) => s.isDark);

  useEffect(() => {
    useThemeStore.getState().init();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthGate />
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </QueryClientProvider>
  );
}
