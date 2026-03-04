export type TripStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed"
  | "cancelled";

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
  country?: string;
  createdAt: number;
  updatedAt: number;
  respondedAt: number | null;
}
