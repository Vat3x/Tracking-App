export interface Company {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
  settings: CompanySettings;
}

export interface CompanySettings {
  trackingIntervalMinutes: number;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  trackingIntervalMinutes: 40,
};
