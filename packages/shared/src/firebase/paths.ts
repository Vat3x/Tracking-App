// Firestore collection paths
export const COLLECTIONS = {
  COMPANIES: "companies",
  USERS: "users",
  INVITES: "invites",
  TRIPS: "trips",
  TRACKING_LINKS: "tracking_links",
  members: (companyId: string) => `companies/${companyId}/members`,
} as const;

// Realtime Database paths
export const RTDB = {
  driverCurrent: (companyId: string, driverId: string) =>
    `locations/${companyId}/${driverId}/current`,
  driverHistory: (companyId: string, driverId: string) =>
    `locations/${companyId}/${driverId}/history`,
  companyLocations: (companyId: string) => `locations/${companyId}`,
  companyMembers: (companyId: string) => `company_members/${companyId}`,
} as const;
