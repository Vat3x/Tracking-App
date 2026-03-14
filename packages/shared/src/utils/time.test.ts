import { describe, it, expect, vi, afterEach } from "vitest";
import { timeAgo } from "./time";

describe("timeAgo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeNow(offset: number) {
    const now = 1700000000000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return now - offset;
  }

  it("returns 'just now' for timestamps less than 60s ago", () => {
    const ts = fakeNow(30_000); // 30s ago
    expect(timeAgo(ts)).toBe("just now");
  });

  it("returns 'just now' for 0s ago", () => {
    const ts = fakeNow(0);
    expect(timeAgo(ts)).toBe("just now");
  });

  it("returns minutes for 1-59 minutes", () => {
    expect(timeAgo(fakeNow(60_000))).toBe("1m ago");
    expect(timeAgo(fakeNow(5 * 60_000))).toBe("5m ago");
    expect(timeAgo(fakeNow(59 * 60_000))).toBe("59m ago");
  });

  it("returns hours for 1-23 hours", () => {
    expect(timeAgo(fakeNow(60 * 60_000))).toBe("1h ago");
    expect(timeAgo(fakeNow(3 * 60 * 60_000))).toBe("3h ago");
    expect(timeAgo(fakeNow(23 * 60 * 60_000))).toBe("23h ago");
  });

  it("returns days for 24+ hours", () => {
    expect(timeAgo(fakeNow(24 * 60 * 60_000))).toBe("1d ago");
    expect(timeAgo(fakeNow(7 * 24 * 60 * 60_000))).toBe("7d ago");
  });
});
