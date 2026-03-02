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

  setOnline: (online: boolean) => void;
  setIdentity: (companyId: string | null, driverId: string | null) => void;
  setLastSync: (sync: LastSync) => void;
  setPermissionStatus: (status: TrackingState["permissionStatus"]) => void;
  reset: () => void;
}

export const useTrackingStore = create<TrackingState>((set) => ({
  isOnline: false,
  companyId: null,
  driverId: null,
  lastSync: null,
  permissionStatus: "unknown",

  setOnline: (online) => set({ isOnline: online }),
  setIdentity: (companyId, driverId) => set({ companyId, driverId }),
  setLastSync: (sync) => set({ lastSync: sync }),
  setPermissionStatus: (status) => set({ permissionStatus: status }),
  reset: () =>
    set({
      isOnline: false,
      companyId: null,
      driverId: null,
      lastSync: null,
      permissionStatus: "unknown",
    }),
}));
