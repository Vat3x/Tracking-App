export interface LocationUpdate {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  batteryLevel: number;
  isCharging: boolean;
  timestamp: number;
  isOnline: boolean;
}

export interface LocationHistory {
  lat: number;
  lng: number;
  speed: number;
  batteryLevel: number;
  timestamp: number;
}

export interface DriverLocation {
  driverId: string;
  current: LocationUpdate;
}
