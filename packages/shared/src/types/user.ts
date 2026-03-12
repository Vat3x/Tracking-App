export interface User {
  id: string;
  email?: string;
  displayName: string;
  phone?: string;
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
