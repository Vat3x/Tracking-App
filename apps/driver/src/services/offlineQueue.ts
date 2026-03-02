import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { ref, set, push } from "firebase/database";
import { rtdb } from "./firebase";
import { RTDB, OFFLINE_QUEUE_MAX_AGE_MS } from "@nexus/shared";
import { useTrackingStore } from "../stores/tracking";

const QUEUE_KEY = "@nexus/offline_queue";

export interface QueuedLocationUpdate {
  companyId: string;
  driverId: string;
  currentData: {
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    batteryLevel: number;
    isCharging: boolean;
    timestamp: number;
    isOnline: boolean;
  };
  historyData: {
    lat: number;
    lng: number;
    speed: number;
    batteryLevel: number;
    timestamp: number;
  };
  queuedAt: number;
}

/**
 * Add a failed location update to the offline queue.
 */
export async function enqueue(entry: QueuedLocationUpdate): Promise<void> {
  const queue = await getQueue();
  queue.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  useTrackingStore.getState().setPendingSync(queue.length);
}

/**
 * Retrieve all queued entries, filtering out expired ones.
 */
async function getQueue(): Promise<QueuedLocationUpdate[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];

  const queue: QueuedLocationUpdate[] = JSON.parse(raw);
  const now = Date.now();

  return queue.filter((entry) => now - entry.queuedAt < OFFLINE_QUEUE_MAX_AGE_MS);
}

let isReplaying = false;

/**
 * Replay all queued location updates to RTDB.
 */
export async function replayQueue(): Promise<void> {
  if (isReplaying) return;
  isReplaying = true;

  try {
    const queue = await getQueue();
    if (queue.length === 0) return;

    const succeeded: number[] = [];

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      try {
        await set(
          ref(rtdb, RTDB.driverCurrent(entry.companyId, entry.driverId)),
          entry.currentData
        );
        await push(
          ref(rtdb, RTDB.driverHistory(entry.companyId, entry.driverId)),
          entry.historyData
        );
        succeeded.push(i);
      } catch {
        // Stop on first failure — still offline
        break;
      }
    }

    const remaining = queue.filter((_, i) => !succeeded.includes(i));
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    useTrackingStore.getState().setPendingSync(remaining.length);
  } finally {
    isReplaying = false;
  }
}

/**
 * Start listening for network state changes.
 * When connectivity is restored, replay the queue.
 */
export function startNetworkListener(): () => void {
  return NetInfo.addEventListener((state) => {
    const isConnected = state.isConnected && state.isInternetReachable !== false;
    useTrackingStore.getState().setNetworkConnected(!!isConnected);

    if (isConnected) {
      replayQueue();
    }
  });
}

/**
 * Clear the entire queue (e.g. on logout).
 */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
  useTrackingStore.getState().setPendingSync(0);
}
