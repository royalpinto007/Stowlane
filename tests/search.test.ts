import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, matchingTabs, parseQuery, scoreLane } from '../src/search.js';
import type { Lane, StowedTab } from '../src/types.js';

const tab = (url: string, title: string, site: string): StowedTab => ({
  url,
  title,
  site,
  pinned: false,
});

function lane(over: Partial<Lane> = {}): Lane {
  return {
    id: over.id ?? 'id',
    name: 'A lane',
    tabs: [],
    stowedAt: 0,
    starred: false,
    ...over,
  };
}

describe('scoreLane', () => {
  test('a lane-name hit outranks a tab-title hit', () => {
    const named = lane({ name: 'Postgres research' });
    const inTab = lane({ name: 'Other', tabs: [tab('https://x.com', 'postgres tuning', 'x.com')] });
    assert.ok(scoreLane(named, ['postgres']) > scoreLane(inTab, ['postgres']));
  });

  test('every term must appear somewhere in the lane', () => {
    const l = lane({ name: 'Postgres', tabs: [tab('https://x.com', 'indexes', 'x.com')] });
    assert.ok(scoreLane(l, ['postgres', 'indexes']) > 0);
    assert.equal(scoreLane(l, ['postgres', 'kubernetes']), 0);
  });

  test('matches on the site of a tab inside it', () => {
    const l = lane({
      name: 'Untitled',
      tabs: [tab('https://github.com/a', 'A repo', 'github.com')],
    });
    assert.ok(scoreLane(l, ['github']) > 0);
  });

  test('no terms means no score, so an empty query never reorders', () => {
    assert.equal(scoreLane(lane({ name: 'anything' }), []), 0);
  });
});

describe('applyFilters', () => {
  const lanes = [
    lane({ id: 'a', name: 'Postgres', stowedAt: 300, tabs: [tab('https://a.com', 'x', 'a.com')] }),
    lane({
      id: 'b',
      name: 'Flights',
      stowedAt: 200,
      tabs: [tab('https://b.com', 'y', 'b.com'), tab('https://c.com', 'z', 'c.com')],
    }),
    lane({
      id: 'c',
      name: 'Old notes',
      stowedAt: 100,
      starred: true,
      tabs: [tab('https://d.com', 'w', 'd.com')],
    }),
  ];

  test('sorts newest first, but starred lanes float above everything', () => {
    // Starring is an explicit "keep this where I can see it"; a sort should
    // not quietly override it.
    const out = applyFilters(lanes, { query: '', sort: 'newest', starredOnly: false });
    assert.deepEqual(
      out.map((l) => l.id),
      ['c', 'a', 'b']
    );
  });

  test('sorts by tab count when asked', () => {
    const out = applyFilters(lanes, { query: '', sort: 'largest', starredOnly: false });
    // 'c' is starred so still first; then 'b' with two tabs, then 'a'.
    assert.deepEqual(
      out.map((l) => l.id),
      ['c', 'b', 'a']
    );
  });

  test('starred only hides the rest', () => {
    const out = applyFilters(lanes, { query: '', sort: 'newest', starredOnly: true });
    assert.deepEqual(
      out.map((l) => l.id),
      ['c']
    );
  });

  test('a query with no matches returns nothing rather than everything', () => {
    const out = applyFilters(lanes, { query: 'kubernetes', sort: 'newest', starredOnly: false });
    assert.deepEqual(out, []);
  });

  test('finds a lane by a word only present in one of its tabs', () => {
    const out = applyFilters(lanes, { query: 'c.com', sort: 'newest', starredOnly: false });
    assert.deepEqual(
      out.map((l) => l.id),
      ['b']
    );
  });
});

describe('matchingTabs', () => {
  const l = lane({
    name: 'Reading',
    tabs: [
      tab('https://a.com', 'Postgres indexes', 'a.com'),
      tab('https://b.com', 'Cats', 'b.com'),
    ],
  });

  test('narrows an expanded lane to the tabs that matched', () => {
    assert.deepEqual(
      matchingTabs(l, ['postgres']).map((t) => t.site),
      ['a.com']
    );
  });

  test('shows everything when the lane matched on its name alone', () => {
    // An expanded lane showing nothing looks broken, so fall back to all tabs.
    assert.equal(matchingTabs(l, ['reading']).length, 2);
  });

  test('shows everything when there is no query', () => {
    assert.equal(matchingTabs(l, []).length, 2);
  });
});

describe('parseQuery', () => {
  test('lowercases and drops empty tokens', () => {
    assert.deepEqual(parseQuery('  Postgres   Indexes '), ['postgres', 'indexes']);
  });
});
