import { create } from "zustand";
import { subscribeToDriverTrips } from "../services/trips";
import type { Trip } from "@nexus/shared";
import type { Unsubscribe } from "firebase/firestore";

interface TripsState {
  trips: Trip[];
  /** Number of pending trips (for tab badge) */
  pendingCount: number;
  /** True after first snapshot arrives */
  loaded: boolean;
  /** Start listening — call once from _layout */
  subscribe: (driverId: string) => void;
  /** Stop listening */
  unsubscribe: () => void;
}

let unsub: Unsubscribe | null = null;
let currentDriverId: string | null = null;

export const useTripsStore = create<TripsState>((set) => ({
  trips: [],
  pendingCount: 0,
  loaded: false,

  subscribe(driverId: string) {
    // Already subscribed for this driver
    if (unsub && currentDriverId === driverId) return;
    // Clean up previous
    unsub?.();
    currentDriverId = driverId;

    unsub = subscribeToDriverTrips(driverId, (trips) => {
      const pendingCount = trips.filter((t) => t.status === "pending").length;
      set({ trips, pendingCount, loaded: true });
    });
  },

  unsubscribe() {
    unsub?.();
    unsub = null;
    currentDriverId = null;
    set({ trips: [], pendingCount: 0, loaded: false });
  },
}));
