import type { Lane } from './types.js';

/**
 * chrome.storage.local, not IndexedDB.
 *
 * A lane holds a URL, a title and a hostname per tab, so a thousand stowed
 * tabs is well under a megabyte. That fits comfortably inside the roughly 10MB
 * chrome.storage.local allows without the unlimitedStorage permission, and it
 * keeps the permission list to three lines.
 *
 * (Pagefold stores whole article bodies and had to use IndexedDB for exactly
 * the opposite reason. Same author, different data, different answer.)
 */
const KEY = 'stowlane.lanes';

export async function allLanes(): Promise<Lane[]> {
  const stored = await chrome.storage.local.get(KEY);
  const lanes = stored[KEY];
  return Array.isArray(lanes) ? (lanes as Lane[]) : [];
}

export async function saveLanes(lanes: readonly Lane[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: lanes });
}

export async function addLane(lane: Lane): Promise<void> {
  const lanes = await allLanes();
  lanes.unshift(lane);
  await saveLanes(lanes);
}

export async function updateLane(id: string, change: (lane: Lane) => Lane | null): Promise<void> {
  const lanes = await allLanes();
  const index = lanes.findIndex((l) => l.id === id);
  if (index === -1) return;

  const current = lanes[index];
  if (!current) return;
  const next = change(current);

  // A change that returns null means the lane is now empty and should go,
  // rather than leaving a row with nothing in it.
  if (next) lanes[index] = next;
  else lanes.splice(index, 1);

  await saveLanes(lanes);
}

export async function deleteLane(id: string): Promise<void> {
  const lanes = await allLanes();
  await saveLanes(lanes.filter((l) => l.id !== id));
}

export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

/** Bytes in use, for the settings line. */
export async function usageBytes(): Promise<number> {
  try {
    return await chrome.storage.local.getBytesInUse(KEY);
  } catch {
    return 0;
  }
}
