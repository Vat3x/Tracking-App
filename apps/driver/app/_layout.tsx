import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as Updates from "expo-updates";
import { onAuthChange, onUserDocChange } from "../src/services/auth";
import { useAuthStore } from "../src/stores/auth";
import { useThemeStore } from "../src/stores/theme";
import * as Notifications from "expo-notifications";
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
  const { firebaseUser, userDoc, loading, setFirebaseUser, setUserDoc, setLoading, setPendingInviteId } =
    useAuthStore();

  // Handle auth state
  const userDocUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Safety timeout — if onAuthChange never fires, unblock routing after 5s
    const timeout = setTimeout(() => setLoading(false), 5000);

    const unsubscribe = onAuthChange(async (user) => {
      clearTimeout(timeout);
      // Clean up previous user doc listener
      userDocUnsubRef.current?.();
      userDocUnsubRef.current = null;

      if (user) {
        setFirebaseUser({ uid: user.uid, email: user.email });
        // Delay setLoading(false) until first userDoc snapshot fires,
        // otherwise the deleted-user guard fires before userDoc loads.
        let resolved = false;
        userDocUnsubRef.current = onUserDocChange(user.uid, (doc) => {
          setUserDoc(doc);
          if (!resolved) {
            resolved = true;
            setLoading(false);
          }
        });
      } else {
        setFirebaseUser(null);
        setUserDoc(null);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
      userDocUnsubRef.current?.();
    };
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
          // Authenticated: push consent screen on top
          router.push({
            pathname: "/(auth)/accept-invite",
            params: { id: inviteId },
          });
        } else {
          // Not authenticated: set inviteId in store so the login screen
          // reacts immediately (router.replace to same route won't update params)
          setPendingInviteId(inviteId);
        }
      }
    });
    return () => sub.remove();
  }, [router]);

  // Pre-load initial URL + onboarding flag while auth is resolving
  // so routing is synchronous when loading flips to false (avoids OTA-restart race)
  type StartupRoute = { pathname: string; params?: Record<string, string> };
  const [startupRoute, setStartupRoute] = useState<StartupRoute | null>(null);

  useEffect(() => {
    async function preload() {
      const url = await Linking.getInitialURL();
      let invId = url ? extractInviteId(url) : null;

      if (invId) {
        // Save immediately so it survives an OTA restart
        await AsyncStorage.setItem("@pending_invite_id", invId);
      } else {
        // Check for invite ID saved before OTA restart
        const saved = await AsyncStorage.getItem("@pending_invite_id");
        if (saved) {
          invId = saved;
        }
      }

      if (invId) {
        setStartupRoute({ pathname: "/(auth)/login", params: { inviteId: invId } });
      } else {
        const seen = await AsyncStorage.getItem("@onboarding_seen");
        setStartupRoute({ pathname: seen ? "/(auth)/login" : "/(auth)/onboarding" });
      }
    }
    preload();
  }, []);

  // Auth-based routing
  useEffect(() => {
    if (loading) return;
    // Wait until preload finished
    if (!startupRoute) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inMainGroup = segments[0] === "(main)";
    const onAcceptInvite = (segments as string[])[1] === "accept-invite";
    const onInviteRoute = segments[0] === "invite";

    if (!firebaseUser && !inAuthGroup && !onInviteRoute) {
      router.replace(startupRoute as any);
    } else if (firebaseUser && userDoc && !inMainGroup && !onAcceptInvite && !onInviteRoute) {
      router.replace("/(main)/home");
    } else if (firebaseUser && !userDoc && !inAuthGroup && !onAcceptInvite && !onInviteRoute) {
      // Auth token exists but no user doc — account deleted from console
      import("../src/services/auth").then(({ logout }) => logout().catch(() => {}));
    }
  }, [firebaseUser, userDoc, loading, segments, router, startupRoute]);

  return <Slot />;
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const isDark = useThemeStore((s) => s.isDark);

  useEffect(() => {
    useThemeStore.getState().init();
  }, []);

  // Clear badge count on app open
  useEffect(() => {
    Notifications.setBadgeCountAsync(0);
  }, []);

  // Check for OTA updates on launch — download silently, apply on next cold start
  useEffect(() => {
    if (__DEV__) return; // Skip in dev mode
    async function checkForUpdate() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          // Update is ready — will be applied automatically on next app launch
        }
      } catch {
        // Silently ignore update check failures
      }
    }
    checkForUpdate();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthGate />
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </QueryClientProvider>
  );
}
