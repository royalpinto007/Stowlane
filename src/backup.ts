import type { Lane, StowedTab } from './types.js';

export const BACKUP_FORMAT = 'stowlane.backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  lanes: Lane[];
}

export function makeBackup(lanes: readonly Lane[], now: number): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, lanes: [...lanes] };
}

export class BackupError extends Error {}

/**
 * Parse a backup file.
 *
 * Everything is validated rather than trusted. The file comes from the user's
 * disk, so it may be truncated, hand-edited, or a different JSON file picked
 * by mistake, and importing junk is worse than refusing with a reason.
 */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new BackupError('That file does not look like a Stowlane backup.');
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format !== BACKUP_FORMAT) {
    throw new BackupError('That file does not look like a Stowlane backup.');
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    throw new BackupError(
      `That backup was made by a newer version of Stowlane (format ${String(obj.version)}).`
    );
  }
  if (!Array.isArray(obj.lanes) || obj.lanes.length === 0) {
    throw new BackupError('That backup has no lanes in it.');
  }

  const lanes: Lane[] = [];
  for (const entry of obj.lanes) {
    const lane = coerceLane(entry);
    if (lane) lanes.push(lane);
  }

  // Distinct from the empty case above: the file did contain lanes, they were
  // just all unreadable. "Wrong file" and "damaged file" need different
  // answers, because only one of them is worth going to look for a better copy.
  if (!lanes.length) {
    throw new BackupError('None of the lanes in that backup could be read.');
  }

  return {
    format: BACKUP_FORMAT,
    version: obj.version,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : Date.now(),
    lanes,
  };
}

/** Accept one lane, or reject it. A bad row is skipped, not fatal. */
function coerceLane(entry: unknown): Lane | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const o = entry as Record<string, unknown>;

  if (typeof o.id !== 'string' || !o.id) return null;
  if (!Array.isArray(o.tabs)) return null;

  const tabs = o.tabs.map(coerceTab).filter((t): t is StowedTab => t !== null);
  // A lane with no usable tabs restores nothing, so it is not worth importing.
  if (!tabs.length) return null;

  return {
    id: o.id,
    name: typeof o.name === 'string' && o.name ? o.name : `${tabs.length} tabs`,
    tabs,
    stowedAt: typeof o.stowedAt === 'number' ? o.stowedAt : Date.now(),
    starred: o.starred === true,
  };
}

function coerceTab(entry: unknown): StowedTab | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const o = entry as Record<string, unknown>;
  if (typeof o.url !== 'string' || !o.url) return null;

  return {
    url: o.url,
    title: typeof o.title === 'string' && o.title ? o.title : o.url,
    site: typeof o.site === 'string' ? o.site : '',
    pinned: o.pinned === true,
  };
}

/**
 * Merge an imported set into what is already stored.
 *
 * Lanes are matched by id. An imported lane that already exists is skipped
 * rather than merged: two lanes with the same id are the same stow, and
 * combining their tab lists would resurrect tabs the user has since removed.
 */
export function mergeImport(
  existing: readonly Lane[],
  incoming: readonly Lane[]
): { merged: Lane[]; added: number; skipped: number } {
  const known = new Set(existing.map((l) => l.id));
  const fresh = incoming.filter((lane) => !known.has(lane.id));

  return {
    merged: [...fresh, ...existing],
    added: fresh.length,
    skipped: incoming.length - fresh.length,
  };
}
