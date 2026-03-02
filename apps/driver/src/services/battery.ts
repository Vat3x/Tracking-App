import * as Battery from "expo-battery";

export interface BatteryInfo {
  level: number; // 0-1
  isCharging: boolean;
}

export async function getBatteryInfo(): Promise<BatteryInfo> {
  const [level, state] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    Battery.getBatteryStateAsync(),
  ]);

  return {
    level: Math.round(level * 100) / 100, // 0-1 with 2 decimal places
    isCharging:
      state === Battery.BatteryState.CHARGING ||
      state === Battery.BatteryState.FULL,
  };
}
