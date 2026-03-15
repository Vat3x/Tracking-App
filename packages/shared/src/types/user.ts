export interface User {
  id: string;
  email?: string;
  displayName: string;
  phone?: string;
  position?: string;
  // phone and position are required for dispatchers but optional on the type
  // since drivers don't have these fields
  role: "dispatcher" | "driver";
  companyId: string | null;
  fcmToken: string | null;
  createdAt: number;
}

export interface CompanyMember {
  userId: string;
  role: "dispatcher" | "admin";
  joinedAt: number;
}
