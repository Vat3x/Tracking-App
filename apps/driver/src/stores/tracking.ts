import { create } from "zustand";

export interface LastSync {
  timestamp: number;
  lat: number;
  lng: number;
  batteryLevel: number;
  isCharging: boolean;
  speed: number;
}

interface TrackingState {
  isOnline: boolean;
  companyId: string | null;
  driverId: string | null;
  lastSync: LastSync | null;
  permissionStatus: "unknown" | "foreground" | "background" | "denied";
  pendingSync: number;
  isNetworkConnected: boolean;

  setOnline: (online: boolean) => void;
  setIdentity: (companyId: string | null, driverId: string | null) => void;
  setLastSync: (sync: LastSync) => void;
  setPermissionStatus: (status: TrackingState["permissionStatus"]) => void;
  setPendingSync: (count: number) => void;
  setNetworkConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useTrackingStore = create<TrackingState>((set) => ({
  isOnline: false,
  companyId: null,
  driverId: null,
  lastSync: null,
  permissionStatus: "unknown",
  pendingSync: 0,
  isNetworkConnected: true,

  setOnline: (online) => set({ isOnline: online }),
  setIdentity: (companyId, driverId) => set({ companyId, driverId }),
  setLastSync: (sync) => set({ lastSync: sync }),
  setPermissionStatus: (status) => set({ permissionStatus: status }),
  setPendingSync: (count) => set({ pendingSync: count }),
  setNetworkConnected: (connected) => set({ isNetworkConnected: connected }),
  reset: () =>
    set({
      isOnline: false,
      companyId: null,
      driverId: null,
      lastSync: null,
      permissionStatus: "unknown",
      pendingSync: 0,
      isNetworkConnected: true,
    }),
}));
