import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform, Alert } from "react-native";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS } from "@nexus/shared";
import { router } from "expo-router";
import { respondToTrip } from "./trips";

// Show notification banners when app is in foreground
// For trip_created, we suppress the system banner and show an interactive Alert instead
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    // Suppress system banner for trip_created — we show an interactive Alert
    const show = data?.type !== "trip_created";
    return {
      shouldShowAlert: show,
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

/**
 * Request permission and register for push notifications.
 * Gets the native FCM/APNs token and saves it to Firestore.
 */
export async function registerForPushNotifications(
  uid: string
): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission denied");
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1a73e8",
    });
  }

  // Get native device push token (FCM on Android, APNs on iOS)
  // This is what admin.messaging().send() expects
  const tokenData = await Notifications.getDevicePushTokenAsync();
  const token = tokenData.data as string;

  if (!token) {
    console.warn("Push token was empty, skipping save");
    return null;
  }

  try {
    await updateFcmToken(uid, token);
    console.log("FCM token saved to Firestore");
  } catch (err) {
    console.error("Failed to save FCM token to Firestore:", err);
  }

  return token;
}

/**
 * Update the fcmToken field on the user's Firestore document.
 */
export async function updateFcmToken(
  uid: string,
  token: string | null
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
    fcmToken: token,
  });
}

/**
 * Clear the FCM token (e.g. on logout).
 */
export async function clearFcmToken(uid: string): Promise<void> {
  await updateFcmToken(uid, null);
}

/**
 * Set up notification listeners for tap handling and token refresh.
 * Returns a cleanup function.
 */
export function setupNotificationListeners(uid: string): () => void {
  // Handle notification tap (user taps notification from tray)
  const tapSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (
        data?.type === "trip_created" ||
        data?.type === "trip_status_changed" ||
        data?.type === "trip_location_updated"
      ) {
        router.push("/(main)/trips");
      }
    }
  );

  // Handle token refresh
  const tokenSub = Notifications.addPushTokenListener(async (newToken) => {
    const token = newToken.data as string;
    await updateFcmToken(uid, token);
  });

  // Foreground notification received — show interactive alerts
  const fgSub = Notifications.addNotificationReceivedListener((notification) => {
    const { data } = notification.request.content;
    const body = notification.request.content.body ?? "";

    if (data?.type === "trip_created" && data?.tripId) {
      // New trip assignment — show Accept/Decline/View buttons
      Alert.alert(
        "New Trip Assignment",
        body,
        [
          {
            text: "Decline",
            style: "destructive",
            onPress: async () => {
              try {
                await respondToTrip(data.tripId as string, "rejected");
              } catch {
                Alert.alert("Error", "Failed to decline trip.");
              }
            },
          },
          {
            text: "View",
            onPress: () => router.push("/(main)/trips"),
          },
          {
            text: "Accept",
            onPress: async () => {
              try {
                await respondToTrip(data.tripId as string, "accepted");
              } catch {
                Alert.alert("Error", "Failed to accept trip.");
              }
            },
          },
        ]
      );
    } else if (data?.type === "trip_location_updated") {
      Alert.alert("Location Updated", body, [
        { text: "OK" },
        { text: "View", onPress: () => router.push("/(main)/trips") },
      ]);
    } else if (data?.type === "trip_status_changed" && data?.status === "cancelled") {
      Alert.alert("Trip Cancelled", body, [
        { text: "OK" },
        { text: "View", onPress: () => router.push("/(main)/trips") },
      ]);
    }
  });

  return () => {
    tapSub.remove();
    tokenSub.remove();
    fgSub.remove();
  };
}

/**
 * Check if the app was launched by a notification tap (cold start).
 */
export async function checkInitialNotification(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return;

  const data = response.notification.request.content.data;
  if (
    data?.type === "trip_created" ||
    data?.type === "trip_status_changed" ||
    data?.type === "trip_location_updated"
  ) {
    router.push("/(main)/trips");
  }
}
