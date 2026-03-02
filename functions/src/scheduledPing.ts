import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

if (!admin.apps.length) {
  admin.initializeApp();
}

const rtdb = admin.database();
const firestore = admin.firestore();

const STALE_THRESHOLD_MS = 50 * 60 * 1000; // 50 minutes

/**
 * Runs every 40 minutes. Finds drivers who are marked online but haven't
 * sent a location update in >50 minutes, and sends a silent FCM ping
 * to wake their app and trigger a fresh location update.
 */
export const scheduledPing = onSchedule(
  {
    schedule: "every 40 minutes",
    timeZone: "UTC",
    region: "us-central1",
  },
  async () => {
    const now = Date.now();

    const locationsSnap = await rtdb.ref("locations").once("value");
    const locationsData = locationsSnap.val();
    if (!locationsData) return;

    const staleDriverIds: string[] = [];

    for (const companyId of Object.keys(locationsData)) {
      const companyDrivers = locationsData[companyId];
      if (!companyDrivers) continue;

      for (const driverId of Object.keys(companyDrivers)) {
        const current = companyDrivers[driverId]?.current;
        if (!current) continue;

        if (
          current.isOnline === true &&
          current.timestamp &&
          now - current.timestamp > STALE_THRESHOLD_MS
        ) {
          staleDriverIds.push(driverId);
        }
      }
    }

    if (staleDriverIds.length === 0) {
      console.log("No stale drivers found");
      return;
    }

    console.log(`Found ${staleDriverIds.length} stale driver(s), sending ping...`);

    // Fetch FCM tokens for stale drivers
    const driversWithTokens = await Promise.all(
      staleDriverIds.map(async (driverId) => {
        const userDoc = await firestore.doc(`users/${driverId}`).get();
        const fcmToken = userDoc.data()?.fcmToken;
        return { driverId, fcmToken };
      })
    );

    // Send silent data-only FCM to each stale driver
    await Promise.all(
      driversWithTokens
        .filter((d) => d.fcmToken)
        .map(async ({ driverId, fcmToken }) => {
          try {
            await admin.messaging().send({
              token: fcmToken!,
              data: {
                type: "ping",
                timestamp: String(now),
              },
              android: {
                priority: "high",
              },
              apns: {
                payload: {
                  aps: {
                    "content-available": 1,
                  },
                },
              },
            });
            console.log(`Ping sent to driver ${driverId}`);
          } catch (error: unknown) {
            const err = error as { code?: string };
            console.error(`Failed to ping driver ${driverId}:`, err);

            // Clear invalid tokens
            if (
              err.code === "messaging/registration-token-not-registered" ||
              err.code === "messaging/invalid-registration-token"
            ) {
              await firestore.doc(`users/${driverId}`).update({ fcmToken: null });
              console.log(`Cleared invalid FCM token for driver ${driverId}`);
            }
          }
        })
    );
  }
);
