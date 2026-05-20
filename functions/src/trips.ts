import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

/** Helper: sleep for ms */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Helper: get FCM token with retry (handles race condition on fresh login) */
async function getFcmToken(userId: string, retries = 3, delayMs = 2000): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    const doc = await firestore.doc(`users/${userId}`).get();
    const token = doc.data()?.fcmToken;
    if (token) return token;
    if (i < retries - 1) {
      console.log(`getFcmToken: No token for ${userId}, retry ${i + 1}/${retries} in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  return null;
}

/** Android config for high-priority heads-up notifications */
const androidHighPriority = {
  android: {
    priority: "high" as const,
    notification: {
      channelId: "default",
      priority: "high" as const,
      defaultSound: true,
      defaultVibrateTimings: true,
    },
  },
};

/**
 * Send a push notification — auto-detects token type:
 * - Expo push tokens (ExponentPushToken[...]) → Expo Push API
 * - FCM tokens → Firebase Admin SDK (used for dispatcher web tokens)
 */
async function sendPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  const isExpoToken = token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");

  if (isExpoToken) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: "default",
        priority: "high",
        channelId: "default",
      }),
    });
    if (!res.ok) {
      throw new Error(`Expo Push API failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json() as { data?: { status?: string; message?: string; details?: { error?: string } } };
    if (json.data?.status === "error") {
      const err = new Error(json.data.message || "Expo push error");
      (err as { code?: string }).code = json.data.details?.error;
      throw err;
    }
    return;
  }

  await admin.messaging().send({
    token,
    notification: { title, body },
    data,
    ...androidHighPriority,
  });
}

/**
 * When a new trip is created, send FCM push to the assigned driver.
 */
export const onTripCreated = onDocumentCreated("trips/{tripId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const { driverId, stops, origin, destination } = data;
  if (!driverId) return;

  // Build route description — supports new TripStop[] and legacy origin/destination
  let routeDesc = "New trip";
  if (stops && Array.isArray(stops) && stops.length > 0 && stops[0].type) {
    // New format: TripStop[] with type field
    routeDesc = stops.map((s: { label?: string }) => s.label ?? "Stop").join(" → ");
  } else {
    // Legacy format
    const parts = [origin?.label ?? "Pickup"];
    if (stops && Array.isArray(stops)) {
      stops.forEach((s: { label?: string }) => parts.push(s.label ?? "Stop"));
    }
    if (destination?.label) parts.push(destination.label);
    routeDesc = parts.join(" → ");
  }

  // Get driver's FCM token with retry (driver may have just logged in)
  const fcmToken = await getFcmToken(driverId);

  if (!fcmToken) {
    console.log(`onTripCreated: No FCM token for driver ${driverId} after retries, skipping notification`);
    return;
  }

  try {
    await sendPush(fcmToken, "New Trip Assignment", routeDesc, {
      type: "trip_created",
      tripId: event.params.tripId,
    });
    console.log(`onTripCreated: Notification sent to driver ${driverId}`);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered" ||
      code === "DeviceNotRegistered"
    ) {
      console.log(`onTripCreated: Invalid push token for driver ${driverId}, clearing`);
      await firestore.doc(`users/${driverId}`).update({ fcmToken: null });
    } else {
      console.error(`onTripCreated: Failed to send notification to driver ${driverId}:`, err);
    }
  }
});

/**
 * When a trip status changes, notify the dispatcher who created it.
 */
export const onTripStatusChanged = onDocumentUpdated("trips/{tripId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  const { assignedBy, driverId, status } = after;
  if (!assignedBy) return;

  // Get driver doc (needed for both cancelled and status notifications)
  const driverDoc = driverId ? await firestore.doc(`users/${driverId}`).get() : null;
  const driverName = driverDoc?.data()?.displayName ?? "Driver";

  // Check if stops/route were updated → notify driver about location change
  const stopsChanged = JSON.stringify(before.stops) !== JSON.stringify(after.stops);
  const originChanged = JSON.stringify(before.origin) !== JSON.stringify(after.origin);
  const destChanged = JSON.stringify(before.destination) !== JSON.stringify(after.destination);
  const routeChanged = stopsChanged || originChanged || destChanged;

  if (routeChanged && driverId) {
    const driverFcmToken = driverDoc?.data()?.fcmToken;
    if (driverFcmToken) {
      try {
        await sendPush(driverFcmToken, "Route Updated", "Your trip route has been updated by the dispatcher", {
          type: "trip_location_updated",
          tripId: event.params.tripId,
          field: "route",
        });
        console.log(`onTripStatusChanged: Route update notification sent to driver ${driverId}`);
      } catch (err) {
        console.error(`onTripStatusChanged: Failed to send route update notification to driver ${driverId}:`, err);
      }
    }
  }

  // Only proceed if status actually changed
  if (before.status === after.status) return;

  // Auto-deactivate tracking links when trip ends
  if (["completed", "cancelled", "rejected"].includes(status)) {
    try {
      const trackingLinksSnap = await firestore
        .collection("tracking_links")
        .where("tripId", "==", event.params.tripId)
        .where("active", "==", true)
        .get();

      if (!trackingLinksSnap.empty) {
        const batch = firestore.batch();
        trackingLinksSnap.docs.forEach((doc) => {
          batch.update(doc.ref, { active: false });
        });
        await batch.commit();
        console.log(`onTripStatusChanged: Deactivated ${trackingLinksSnap.size} tracking link(s) for trip ${event.params.tripId}`);
      }
    } catch (err) {
      console.error(`onTripStatusChanged: Failed to deactivate tracking links:`, err);
    }
  }

  // Cancelled by dispatcher → notify the driver instead
  if (status === "cancelled" && driverId) {
    const driverFcmToken = driverDoc?.data()?.fcmToken;
    if (!driverFcmToken) {
      console.log(`onTripStatusChanged: No FCM token for driver ${driverId}, skipping cancelled notification`);
      return;
    }
    try {
      await sendPush(driverFcmToken, "Trip Cancelled", "Your trip was cancelled by the dispatcher", {
        type: "trip_status_changed",
        tripId: event.params.tripId,
        status,
      });
      console.log(`onTripStatusChanged: Cancelled notification sent to driver ${driverId}`);
    } catch (err) {
      console.error(`onTripStatusChanged: Failed to send cancelled notification to driver ${driverId}:`, err);
    }
    return;
  }

  // Get dispatcher's FCM token
  const dispatcherDoc = await firestore.doc(`users/${assignedBy}`).get();
  const fcmToken = dispatcherDoc.data()?.fcmToken;

  const statusMessages: Record<string, string> = {
    accepted: `${driverName} accepted the trip`,
    rejected: `${driverName} declined the trip`,
    in_progress: `${driverName} started the trip`,
    completed: `${driverName} completed the trip`,
  };

  const message = statusMessages[status];
  if (!message) return;

  if (!fcmToken) {
    console.log(`onTripStatusChanged: No FCM token for dispatcher ${assignedBy}, skipping notification`);
    return;
  }

  try {
    await sendPush(fcmToken, "Trip Update", message, {
      type: "trip_status_changed",
      tripId: event.params.tripId,
      status,
    });
    console.log(`onTripStatusChanged: Notification sent to dispatcher ${assignedBy}`);
  } catch (err) {
    console.error(`onTripStatusChanged: Failed to send notification to dispatcher ${assignedBy}:`, err);
  }
});
