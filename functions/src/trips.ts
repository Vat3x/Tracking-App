import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

/**
 * When a new trip is created, send FCM push to the assigned driver.
 * (FCM token registration is Phase 6 — for now, just log.)
 */
export const onTripCreated = onDocumentCreated("trips/{tripId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const { driverId, origin, destination } = data;
  if (!driverId) return;

  // Get driver's FCM token
  const driverDoc = await firestore.doc(`users/${driverId}`).get();
  const fcmToken = driverDoc.data()?.fcmToken;

  if (fcmToken) {
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
    });
  }
});

/**
 * When a trip status changes, notify the dispatcher who created it.
 */
export const onTripStatusChanged = onDocumentUpdated("trips/{tripId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;
  if (before.status === after.status) return;

  const { assignedBy, driverId, status } = after;
  if (!assignedBy) return;

  // Get dispatcher's FCM token
  const dispatcherDoc = await firestore.doc(`users/${assignedBy}`).get();
  const fcmToken = dispatcherDoc.data()?.fcmToken;

  // Get driver name for notification
  const driverDoc = await firestore.doc(`users/${driverId}`).get();
  const driverName = driverDoc.data()?.displayName ?? "Driver";

  const statusMessages: Record<string, string> = {
    accepted: `${driverName} accepted the trip`,
    rejected: `${driverName} declined the trip`,
    in_progress: `${driverName} started the trip`,
    completed: `${driverName} completed the trip`,
  };

  const message = statusMessages[status];
  if (!message) return;

  if (fcmToken) {
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
    });
  }
});
