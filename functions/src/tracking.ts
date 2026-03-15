import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();
const rtdb = admin.database();

/**
 * Public HTTP endpoint to fetch tracking data for a shareable trip link.
 * No authentication required — link UUID is the access token.
 * Returns trip status, stops, driver location, and ETA-relevant data.
 */
export const getTrackingData = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const linkId = req.query.linkId as string;
  if (!linkId || typeof linkId !== "string") {
    res.status(400).json({ error: "linkId query parameter is required" });
    return;
  }

  // 1. Look up tracking link
  const linksSnap = await firestore
    .collection("tracking_links")
    .where("linkId", "==", linkId)
    .limit(1)
    .get();

  if (linksSnap.empty) {
    res.status(404).json({ error: "Tracking link not found" });
    return;
  }

  const linkData = linksSnap.docs[0].data();

  // 2. Validate link is active and not expired
  if (!linkData.active) {
    res.status(410).json({ error: "This tracking link is no longer active" });
    return;
  }

  if (linkData.expiresAt < Date.now()) {
    res.status(410).json({ error: "This tracking link has expired" });
    return;
  }

  // 3. Fetch trip
  const tripSnap = await firestore.doc(`trips/${linkData.tripId}`).get();
  if (!tripSnap.exists) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  const trip = tripSnap.data()!;

  // 4. Fetch driver's current location from RTDB
  const locationSnap = await rtdb
    .ref(`locations/${linkData.companyId}/${linkData.driverId}/current`)
    .once("value");
  const location = locationSnap.val();

  // 5. Fetch driver name
  const driverSnap = await firestore.doc(`users/${linkData.driverId}`).get();
  const driverName = driverSnap.data()?.displayName ?? "Driver";

  // 6. Return sanitized response
  res.json({
    status: trip.status,
    stops: trip.stops ?? [],
    country: trip.country ?? "us",
    currentStopIndex: trip.currentStopIndex ?? 0,
    driverName,
    driverLocation: location
      ? {
          lat: location.lat,
          lng: location.lng,
          speed: location.speed ?? 0,
          heading: location.heading ?? 0,
          timestamp: location.timestamp,
          isOnline: location.isOnline ?? false,
        }
      : null,
  });
});
