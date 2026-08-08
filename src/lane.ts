import type { Lane, StowedTab } from './types.js';

/** Hostname without a leading www. */
export function siteOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Tabs Chrome will not let us restore, or that make no sense to.
 *
 * Restoring a chrome:// URL silently fails, and a blank new tab is not
 * something anyone stowed on purpose. Dropping them here means the count the
 * user sees matches what actually comes back.
 */
export function isStowable(url: string): boolean {
  if (!url) return false;
  if (url === 'about:blank' || url === 'chrome://newtab/') return false;
  return /^(https?|file|ftp):/i.test(url);
}

/**
 * Collapse duplicates within one lane.
 *
 * The same page open in three tabs is almost always accidental, and restoring
 * all three recreates the mess the user was trying to clear. The first
 * occurrence wins so tab order is preserved.
 */
export function dedupeTabs(tabs: readonly StowedTab[]): StowedTab[] {
  const seen = new Set<string>();
  const out: StowedTab[] = [];
  for (const tab of tabs) {
    if (seen.has(tab.url)) continue;
    seen.add(tab.url);
    out.push(tab);
  }
  return out;
}

/**
 * Name a lane from what is in it.
 *
 * A date alone ("14 March, 22 tabs") is useless a week later when there are
 * six of them. The dominant site is what people actually remember: the lane
 * where they were reading about Postgres, the lane full of flight searches.
 * The count is the tiebreaker for two lanes from the same site.
 */
export function suggestName(tabs: readonly StowedTab[]): string {
  if (!tabs.length) return 'Empty lane';

  const counts = new Map<string, number>();
  for (const tab of tabs) {
    if (!tab.site) continue;
    counts.set(tab.site, (counts.get(tab.site) ?? 0) + 1);
  }

  if (!counts.size) return `${tabs.length} tabs`;

  let top = '';
  let topCount = 0;
  for (const [site, n] of counts) {
    // Ties go to the site seen first, which is the leftmost tab.
    if (n > topCount) {
      top = site;
      topCount = n;
    }
  }

  const others = tabs.length - topCount;
  if (others === 0) return `${top} (${tabs.length})`;
  // "and 4 more" reads better than a bare count when the lane is mixed.
  return `${top} and ${others} more`;
}

/** Build a lane from raw tab data. */
export function makeLane(tabs: readonly StowedTab[], now: number, name?: string): Lane {
  const kept = dedupeTabs(tabs.filter((t) => isStowable(t.url)));
  return {
    // Time plus a short random suffix: two lanes stowed in the same
    // millisecond from different windows would otherwise collide.
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name?.trim() || suggestName(kept),
    tabs: kept,
    stowedAt: now,
    starred: false,
  };
}

/** Total tabs across every lane, for the header count. */
export function totalTabs(lanes: readonly Lane[]): number {
  return lanes.reduce((n, lane) => n + lane.tabs.length, 0);
}

/**
 * Remove one tab from a lane, returning the lane or null if it is now empty.
 *
 * Returning null rather than an empty lane means the caller deletes it, and
 * the user never accumulates rows containing nothing.
 */
export function withoutTab(lane: Lane, url: string): Lane | null {
  const tabs = lane.tabs.filter((t) => t.url !== url);
  if (!tabs.length) return null;
  return { ...lane, tabs };
}
