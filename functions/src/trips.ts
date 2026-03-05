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
 * When a new trip is created, send FCM push to the assigned driver.
 */
export const onTripCreated = onDocumentCreated("trips/{tripId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const { driverId, origin, destination } = data;
  if (!driverId) return;

  // Get driver's FCM token with retry (driver may have just logged in)
  const fcmToken = await getFcmToken(driverId);

  if (!fcmToken) {
    console.log(`onTripCreated: No FCM token for driver ${driverId} after retries, skipping notification`);
    return;
  }

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: "New Trip Assignment",
        body: `${origin?.label ?? "Pickup"} → ${destination?.label ?? "Drop-off"}`,
      },
      data: {
        type: "trip_created",
        tripId: event.params.tripId,
      },
      ...androidHighPriority,
    });
    console.log(`onTripCreated: Notification sent to driver ${driverId}`);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
      console.log(`onTripCreated: Invalid FCM token for driver ${driverId}, clearing`);
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

  // Check if origin or destination was updated → notify driver about location change
  const originChanged = JSON.stringify(before.origin) !== JSON.stringify(after.origin);
  const destChanged = JSON.stringify(before.destination) !== JSON.stringify(after.destination);

  if ((originChanged || destChanged) && driverId) {
    const driverFcmToken = driverDoc?.data()?.fcmToken;
    if (driverFcmToken) {
      const changedField = originChanged ? "pickup" : "delivery";
      const newLabel = originChanged ? after.origin?.label : after.destination?.label;
      try {
        await admin.messaging().send({
          token: driverFcmToken,
          notification: {
            title: "Delivery Location Updated",
            body: `${changedField === "pickup" ? "Pickup" : "Delivery"} location changed to ${newLabel ?? "new location"}`,
          },
          data: {
            type: "trip_location_updated",
            tripId: event.params.tripId,
            field: changedField,
          },
          ...androidHighPriority,
        });
        console.log(`onTripStatusChanged: Location update notification sent to driver ${driverId}`);
      } catch (err) {
        console.error(`onTripStatusChanged: Failed to send location update notification to driver ${driverId}:`, err);
      }
    }
  }

  // Only proceed if status actually changed
  if (before.status === after.status) return;

  // Cancelled by dispatcher → notify the driver instead
  if (status === "cancelled" && driverId) {
    const driverFcmToken = driverDoc?.data()?.fcmToken;
    if (!driverFcmToken) {
      console.log(`onTripStatusChanged: No FCM token for driver ${driverId}, skipping cancelled notification`);
      return;
    }
    try {
      await admin.messaging().send({
        token: driverFcmToken,
        notification: {
          title: "Trip Cancelled",
          body: "Your trip was cancelled by the dispatcher",
        },
        data: {
          type: "trip_status_changed",
          tripId: event.params.tripId,
          status,
        },
        ...androidHighPriority,
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
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: "Trip Update",
        body: message,
      },
      data: {
        type: "trip_status_changed",
        tripId: event.params.tripId,
        status,
      },
      ...androidHighPriority,
    });
    console.log(`onTripStatusChanged: Notification sent to dispatcher ${assignedBy}`);
  } catch (err) {
    console.error(`onTripStatusChanged: Failed to send notification to dispatcher ${assignedBy}:`, err);
  }
});
