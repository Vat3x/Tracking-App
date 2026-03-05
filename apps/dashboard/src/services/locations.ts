import { ref, onValue, get, type Unsubscribe } from "firebase/database";
import { rtdb } from "./firebase";
import { RTDB, type LocationUpdate, type LocationHistory } from "@nexus/shared";

export interface DriverLocationEntry {
  driverId: string;
  current: LocationUpdate;
}

/**
 * Subscribe to real-time location updates for all drivers in a company.
 * Returns an unsubscribe function.
 */
export function subscribeToCompanyLocations(
  companyId: string,
  callback: (drivers: DriverLocationEntry[]) => void
): Unsubscribe {
  const locRef = ref(rtdb, RTDB.companyLocations(companyId));

  return onValue(locRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const drivers: DriverLocationEntry[] = [];
    for (const [driverId, driverData] of Object.entries(data)) {
      const d = driverData as { current?: LocationUpdate };
      if (d.current) {
        drivers.push({ driverId, current: d.current });
      }
    }
    callback(drivers);
  });
}

/**
 * Fetch location history for a specific driver.
 * Returns entries sorted by timestamp ascending.
 */
export async function getDriverHistory(
  companyId: string,
  driverId: string
): Promise<LocationHistory[]> {
  const histRef = ref(rtdb, RTDB.driverHistory(companyId, driverId));
  const snapshot = await get(histRef);
  const data = snapshot.val();
  if (!data) return [];

  const entries: LocationHistory[] = [];
  for (const value of Object.values(data)) {
    const entry = value as LocationHistory;
    if (entry.lat && entry.lng && entry.timestamp) {
      entries.push(entry);
    }
  }
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}
