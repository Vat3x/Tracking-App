import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { type Trip, type User, getTripRouteLabel } from "@nexus/shared";

/**
 * Detects trip status transitions and shows toast notifications.
 * Skips initial load to avoid toasting for already-completed trips.
 */
export function useTripNotifications(
  trips: Trip[],
  driverProfiles: Map<string, User>
) {
  const prevTripsRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const currentMap = new Map(trips.map((t) => [t.id, t.status]));

    // Skip first snapshot (initial load)
    if (prevTripsRef.current === null) {
      prevTripsRef.current = currentMap;
      return;
    }

    const prev = prevTripsRef.current;

    for (const trip of trips) {
      const prevStatus = prev.get(trip.id);
      if (!prevStatus || prevStatus === trip.status) continue;

      const driverName =
        driverProfiles.get(trip.driverId ?? "")?.displayName ??
        "A driver";

      if (trip.status === "completed") {
        toast.success(`${driverName} completed the trip`, {
          description: getTripRouteLabel(trip),
        });
      } else if (trip.status === "accepted") {
        toast.info(`${driverName} accepted the trip`);
      } else if (trip.status === "rejected") {
        toast(`${driverName} declined the trip`, { icon: "⚠️" });
      } else if (trip.status === "in_progress") {
        toast.info(`${driverName} started the trip`);
      }
    }

    prevTripsRef.current = currentMap;
  }, [trips, driverProfiles]);
}
