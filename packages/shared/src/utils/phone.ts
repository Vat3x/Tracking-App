/** Extract only digits from a raw phone input */
export function extractDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Validate that a phone number has enough digits (>= 7) */
export function isValidPhoneDigits(raw: string): boolean {
  return extractDigits(raw).length >= 7;
}

/** Build a full E.164-style phone number from country code + raw input */
export function buildFullNumber(countryCode: string, rawInput: string): string {
  return countryCode + extractDigits(rawInput);
}

/** Sanitize OTP input: keep only digits, max 6 characters */
export function sanitizeOtp(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

/** Common country codes (US-optimized) */
export const COUNTRY_CODES = [
  { code: "+1", label: "US/CA +1" },
  { code: "+52", label: "MX +52" },
  { code: "+44", label: "UK +44" },
  { code: "+49", label: "DE +49" },
  { code: "+33", label: "FR +33" },
  { code: "+91", label: "IN +91" },
  { code: "+86", label: "CN +86" },
  { code: "+81", label: "JP +81" },
  { code: "+995", label: "GE +995" },
] as const;
