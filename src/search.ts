import type { Filters, Lane } from './types.js';

export function parseQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Score a lane against a query.
 *
 * A lane matches on its own name or on any tab inside it, and where the hit
 * lands decides the order. Every term must appear somewhere in the lane, so
 * adding a word always narrows rather than widening.
 */
export function scoreLane(lane: Lane, terms: readonly string[]): number {
  if (!terms.length) return 0;

  const name = lane.name.toLowerCase();
  const titles = lane.tabs.map((t) => t.title.toLowerCase()).join(' ');
  const sites = lane.tabs.map((t) => t.site.toLowerCase()).join(' ');
  const urls = lane.tabs.map((t) => t.url.toLowerCase()).join(' ');

  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (name.includes(term)) termScore += name.startsWith(term) ? 12 : 8;
    if (sites.includes(term)) termScore += 5;
    if (titles.includes(term)) termScore += 3;
    if (urls.includes(term)) termScore += 1;
    if (termScore === 0) return 0;
    score += termScore;
  }
  return score;
}

/** Tabs inside a lane that match, so an expanded lane can show only those. */
export function matchingTabs(lane: Lane, terms: readonly string[]): Lane['tabs'] {
  if (!terms.length) return lane.tabs;
  const hits = lane.tabs.filter((tab) => {
    const haystack = `${tab.title} ${tab.site} ${tab.url}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
  // A lane can match on its name alone while no single tab does. Showing an
  // empty lane in that case looks broken, so fall back to everything.
  return hits.length ? hits : lane.tabs;
}

const SORTERS: Record<Filters['sort'], (a: Lane, b: Lane) => number> = {
  newest: (a, b) => b.stowedAt - a.stowedAt,
  oldest: (a, b) => a.stowedAt - b.stowedAt,
  largest: (a, b) => b.tabs.length - a.tabs.length,
  name: (a, b) => a.name.localeCompare(b.name),
};

/**
 * Filter and order the lanes for display.
 *
 * Starred lanes float to the top regardless of sort, because starring is an
 * explicit "keep this where I can see it" and a sort should not override it.
 * With a query, relevance decides the rest.
 */
export function applyFilters(lanes: readonly Lane[], filters: Filters): Lane[] {
  const terms = parseQuery(filters.query);
  const sorter = SORTERS[filters.sort] ?? SORTERS.newest;

  const rows = lanes
    .filter((lane) => (filters.starredOnly ? lane.starred : true))
    .map((lane) => ({ lane, score: scoreLane(lane, terms) }))
    .filter((row) => (terms.length ? row.score > 0 : true));

  rows.sort((x, y) => {
    if (x.lane.starred !== y.lane.starred) return x.lane.starred ? -1 : 1;
    if (terms.length && x.score !== y.score) return y.score - x.score;
    return sorter(x.lane, y.lane);
  });

  return rows.map((row) => row.lane);
}
