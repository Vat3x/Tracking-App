import AsyncStorage from "@react-native-async-storage/async-storage";

const ID_KEY = "@pending_invite_id";
const TS_KEY = "@pending_invite_ts";
const TTL_MS = 10 * 60 * 1000;

export async function savePendingInvite(id: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ID_KEY, id],
    [TS_KEY, String(Date.now())],
  ]);
}

export async function getPendingInvite(): Promise<string | null> {
  const [[, id], [, ts]] = await AsyncStorage.multiGet([ID_KEY, TS_KEY]);
  if (!id) return null;
  const savedAt = ts ? parseInt(ts, 10) : 0;
  if (!savedAt || Date.now() - savedAt > TTL_MS) {
    await clearPendingInvite();
    return null;
  }
  return id;
}

export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.multiRemove([ID_KEY, TS_KEY]);
}
