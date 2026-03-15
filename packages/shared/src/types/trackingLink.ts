export interface TrackingLink {
  id: string;
  linkId: string;
  tripId: string;
  companyId: string;
  driverId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  active: boolean;
}
