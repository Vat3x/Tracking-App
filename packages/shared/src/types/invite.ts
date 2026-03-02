export type InviteStatus = "pending" | "accepted" | "expired";

export interface Invite {
  id: string;
  companyId: string;
  companyName: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  status: InviteStatus;
  acceptedBy: string | null;
}
