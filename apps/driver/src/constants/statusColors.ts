import type { TripStatus } from "@nexus/shared";

export function getStatusColors(
  isDark: boolean
): Record<TripStatus, { bg: string; text: string }> {
  if (isDark) {
    return {
      pending: { bg: "#422006", text: "#fbbf24" },
      accepted: { bg: "#172554", text: "#93c5fd" },
      rejected: { bg: "#450a0a", text: "#fca5a5" },
      in_progress: { bg: "#1e1b4b", text: "#a5b4fc" },
      completed: { bg: "#052e16", text: "#86efac" },
      cancelled: { bg: "#450a0a", text: "#fca5a5" },
    };
  }
  return {
    pending: { bg: "#fef9c3", text: "#854d0e" },
    accepted: { bg: "#dbeafe", text: "#1e40af" },
    rejected: { bg: "#fee2e2", text: "#991b1b" },
    in_progress: { bg: "#e0e7ff", text: "#3730a3" },
    completed: { bg: "#dcfce7", text: "#166534" },
    cancelled: { bg: "#fee2e2", text: "#991b1b" },
  };
}
