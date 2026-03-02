import { ref, onValue, type Unsubscribe } from "firebase/database";
import { rtdb } from "./firebase";
import { RTDB, type LocationUpdate } from "@nexus/shared";

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
