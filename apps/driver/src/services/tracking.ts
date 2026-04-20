import { ref, set, push } from "firebase/database";
import { rtdb } from "./firebase";
import { RTDB } from "@nexus/shared";
import type { LocationObject } from "expo-location";
import { getBatteryInfo } from "./battery";
import { useTrackingStore } from "../stores/tracking";
import { enqueue } from "./offlineQueue";

/**
 * Called by the background location task (and on-demand) to write
 * the driver's current location + battery info to Firebase RTDB.
 * On failure, queues the update for later replay.
 */
export async function updateDriverLocation(
  location: LocationObject
): Promise<void> {
  const { companyId, driverId } = useTrackingStore.getState();
  if (!companyId || !driverId) return;

  const battery = await getBatteryInfo();

  const currentData = {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    speed: location.coords.speed ?? 0,
    heading: location.coords.heading ?? 0,
    batteryLevel: battery.level,
    isCharging: battery.isCharging,
    timestamp: Date.now(),
    isOnline: true,
  };

  const historyData = {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    speed: location.coords.speed ?? 0,
    batteryLevel: battery.level,
    timestamp: Date.now(),
  };

  try {
    // Write current location
    await set(ref(rtdb, RTDB.driverCurrent(companyId, driverId)), currentData);

    // Append to history
    await push(ref(rtdb, RTDB.driverHistory(companyId, driverId)), historyData);

    // Update local store with last sync info
    useTrackingStore.getState().setLastSync({
      timestamp: Date.now(),
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      batteryLevel: battery.level,
      isCharging: battery.isCharging,
      speed: location.coords.speed ?? 0,
      heading: location.coords.heading ?? 0,
    });
  } catch (error) {
    console.warn("Location write failed, queuing for offline replay:", error);
    await enqueue({ companyId, driverId, currentData, historyData, queuedAt: Date.now() });
  }
}

/**
 * Mark the driver as offline in RTDB.
 */
export async function markDriverOffline(): Promise<void> {
  const { companyId, driverId } = useTrackingStore.getState();
  if (!companyId || !driverId) return;

  await set(
    ref(rtdb, RTDB.driverCurrent(companyId, driverId) + "/isOnline"),
    false
  );
  await set(
    ref(rtdb, RTDB.driverCurrent(companyId, driverId) + "/timestamp"),
    Date.now()
  );
}
