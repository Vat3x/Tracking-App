import { create } from "zustand";
import type { DriverLocationEntry } from "@/services/locations";

interface DriversState {
  drivers: DriverLocationEntry[];
  selectedDriverId: string | null;
  setDrivers: (drivers: DriverLocationEntry[]) => void;
  selectDriver: (driverId: string | null) => void;
}

export const useDriversStore = create<DriversState>((set) => ({
  drivers: [],
  selectedDriverId: null,
  setDrivers: (drivers) => set({ drivers }),
  selectDriver: (driverId) => set({ selectedDriverId: driverId }),
}));
