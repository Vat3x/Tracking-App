export type TripStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed";

export interface GeoPoint {
  label: string;
  lat: number;
  lng: number;
  zipCode?: string;
}

export interface Trip {
  id: string;
  companyId: string;
  driverId: string | null;
  assignedBy: string;
  status: TripStatus;
  origin: GeoPoint;
  destination: GeoPoint;
  createdAt: number;
  updatedAt: number;
  respondedAt: number | null;
}
