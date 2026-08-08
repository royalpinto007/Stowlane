import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeTabs,
  isStowable,
  makeLane,
  siteOf,
  suggestName,
  totalTabs,
  withoutTab,
} from '../src/lane.js';
import type { StowedTab } from '../src/types.js';

const tab = (url: string, title = 'A page', site?: string): StowedTab => ({
  url,
  title,
  site: site ?? siteOf(url),
  pinned: false,
});

describe('isStowable', () => {
  test('accepts pages a browser can actually reopen', () => {
    assert.ok(isStowable('https://example.com/a'));
    assert.ok(isStowable('http://example.com'));
    assert.ok(isStowable('file:///home/a.pdf'));
  });

  test('rejects pages Chrome refuses to restore', () => {
    // Restoring these silently fails, so counting them would make the number
    // the user sees disagree with what comes back.
    assert.equal(isStowable('chrome://extensions'), false);
    assert.equal(isStowable('chrome-extension://abc/page.html'), false);
    assert.equal(isStowable('about:blank'), false);
    assert.equal(isStowable(''), false);
  });
});

describe('dedupeTabs', () => {
  test('collapses the same page opened several times', () => {
    const out = dedupeTabs([tab('https://a.com/x'), tab('https://b.com'), tab('https://a.com/x')]);
    assert.equal(out.length, 2);
  });

  test('keeps the first occurrence, so tab order survives', () => {
    const out = dedupeTabs([tab('https://a.com', 'first'), tab('https://a.com', 'second')]);
    assert.equal(out[0]?.title, 'first');
  });

  test('treats different paths on one site as different tabs', () => {
    assert.equal(dedupeTabs([tab('https://a.com/x'), tab('https://a.com/y')]).length, 2);
  });
});

describe('suggestName', () => {
  test('names a single-site lane after the site', () => {
    const name = suggestName([tab('https://github.com/a'), tab('https://github.com/b')]);
    assert.equal(name, 'github.com (2)');
  });

  test('names a mixed lane after the dominant site', () => {
    // The site you were mostly on is what you will remember the lane by.
    const name = suggestName([
      tab('https://github.com/a'),
      tab('https://github.com/b'),
      tab('https://news.com/x'),
    ]);
    assert.equal(name, 'github.com and 1 more');
  });

  test('handles an empty lane rather than producing a broken label', () => {
    assert.equal(suggestName([]), 'Empty lane');
  });

  test('falls back to a count when no tab has a usable host', () => {
    assert.equal(suggestName([tab('file:///a.pdf', 'A', '')]), '1 tabs');
  });
});

describe('makeLane', () => {
  test('drops unstowable tabs and dedupes in one pass', () => {
    const lane = makeLane(
      [tab('https://a.com'), tab('chrome://settings'), tab('https://a.com'), tab('https://b.com')],
      1000
    );
    assert.deepEqual(
      lane.tabs.map((t) => t.url),
      ['https://a.com', 'https://b.com']
    );
  });

  test('generates unique ids for lanes stowed in the same millisecond', () => {
    // Two windows stowed together would otherwise collide and overwrite.
    const a = makeLane([tab('https://a.com')], 1000);
    const b = makeLane([tab('https://b.com')], 1000);
    assert.notEqual(a.id, b.id);
  });

  test('uses a supplied name over the suggestion', () => {
    assert.equal(makeLane([tab('https://a.com')], 1, '  Trip planning ').name, 'Trip planning');
  });

  test('falls back to the suggestion when the supplied name is blank', () => {
    assert.equal(makeLane([tab('https://a.com')], 1, '   ').name, 'a.com (1)');
  });
});

describe('withoutTab', () => {
  test('removes one tab and keeps the lane', () => {
    const lane = makeLane([tab('https://a.com'), tab('https://b.com')], 1);
    const next = withoutTab(lane, 'https://a.com');
    assert.equal(next?.tabs.length, 1);
  });

  test('returns null when the last tab goes, so the caller can delete it', () => {
    // An empty lane is a row that does nothing; the user should never collect them.
    const lane = makeLane([tab('https://a.com')], 1);
    assert.equal(withoutTab(lane, 'https://a.com'), null);
  });
});

describe('totalTabs', () => {
  test('sums across lanes', () => {
    const a = makeLane([tab('https://a.com'), tab('https://b.com')], 1);
    const b = makeLane([tab('https://c.com')], 2);
    assert.equal(totalTabs([a, b]), 3);
  });
});

describe('siteOf', () => {
  test('drops www and survives a non-URL', () => {
    assert.equal(siteOf('https://www.example.com/a'), 'example.com');
    assert.equal(siteOf('nonsense'), '');
  });
});
