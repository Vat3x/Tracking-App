import { describe, it, expect } from "vitest";
import {
  extractDigits,
  isValidPhoneDigits,
  buildFullNumber,
  sanitizeOtp,
  COUNTRY_CODES,
} from "./phone";

describe("extractDigits", () => {
  it("strips non-digit characters", () => {
    expect(extractDigits("(555) 123-4567")).toBe("5551234567");
  });

  it("returns empty string for no digits", () => {
    expect(extractDigits("abc")).toBe("");
  });

  it("keeps digits as-is", () => {
    expect(extractDigits("1234567890")).toBe("1234567890");
  });

  it("handles spaces and dashes", () => {
    expect(extractDigits("555 123 4567")).toBe("5551234567");
    expect(extractDigits("555-123-4567")).toBe("5551234567");
  });
});

describe("isValidPhoneDigits", () => {
  it("rejects numbers with fewer than 7 digits", () => {
    expect(isValidPhoneDigits("123456")).toBe(false);
    expect(isValidPhoneDigits("12345")).toBe(false);
    expect(isValidPhoneDigits("")).toBe(false);
  });

  it("accepts numbers with 7+ digits", () => {
    expect(isValidPhoneDigits("1234567")).toBe(true);
    expect(isValidPhoneDigits("5551234567")).toBe(true);
  });

  it("counts only digits in formatted input", () => {
    expect(isValidPhoneDigits("(555) 12")).toBe(false); // 5 digits
    expect(isValidPhoneDigits("(555) 123-4567")).toBe(true); // 10 digits
  });
});

describe("buildFullNumber", () => {
  it("combines country code + digits from raw input", () => {
    expect(buildFullNumber("+1", "5551234567")).toBe("+15551234567");
  });

  it("strips formatting from raw input", () => {
    expect(buildFullNumber("+1", "(555) 123-4567")).toBe("+15551234567");
  });

  it("works with various country codes", () => {
    expect(buildFullNumber("+44", "7911123456")).toBe("+447911123456");
    expect(buildFullNumber("+995", "555123456")).toBe("+995555123456");
  });
});

describe("sanitizeOtp", () => {
  it("keeps only digits", () => {
    expect(sanitizeOtp("12a3b4")).toBe("1234");
  });

  it("limits to 6 characters", () => {
    expect(sanitizeOtp("12345678")).toBe("123456");
  });

  it("handles valid 6-digit input", () => {
    expect(sanitizeOtp("123456")).toBe("123456");
  });

  it("returns empty for non-digit input", () => {
    expect(sanitizeOtp("abcdef")).toBe("");
  });

  it("strips spaces and special chars", () => {
    expect(sanitizeOtp("1 2 3 4 5 6")).toBe("123456");
  });
});

describe("COUNTRY_CODES", () => {
  it("has US as first entry", () => {
    expect(COUNTRY_CODES[0].code).toBe("+1");
    expect(COUNTRY_CODES[0].label).toContain("US");
  });

  it("includes Georgia (+995)", () => {
    const ge = COUNTRY_CODES.find((c) => c.code === "+995");
    expect(ge).toBeDefined();
    expect(ge!.label).toContain("GE");
  });

  it("all entries have code and label", () => {
    for (const entry of COUNTRY_CODES) {
      expect(entry.code).toMatch(/^\+\d+$/);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate codes", () => {
    const codes = COUNTRY_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
