import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { TRACKING_INTERVAL_MS, DISTANCE_FILTER_METERS } from "@nexus/shared";
import { updateDriverLocation } from "./tracking";

const BACKGROUND_LOCATION_TASK = "background-location-task";

// Define the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location error:", error);
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  // Use the most recent location
  const location = locations[locations.length - 1];
  await updateDriverLocation(location);
});

export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function requestBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === "granted";
}

export async function checkPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return {
    foreground: fg.status === "granted",
    background: bg.status === "granted",
  };
}

export async function startBackgroundTracking(): Promise<boolean> {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  ).catch(() => false);

  if (isTracking) return true;

  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: TRACKING_INTERVAL_MS,
      distanceInterval: DISTANCE_FILTER_METERS,
      deferredUpdatesInterval: TRACKING_INTERVAL_MS,
      showsBackgroundLocationIndicator: true, // iOS blue bar
      foregroundService: {
        notificationTitle: "Location tracking active",
        notificationBody: "Your location is being shared with your employer for fleet management.",
        notificationColor: "#1a73e8",
      },
    });
    return true;
  } catch (err) {
    console.error("Failed to start background tracking:", err);
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  ).catch(() => false);

  if (isTracking) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
  } catch {
    return null;
  }
}
