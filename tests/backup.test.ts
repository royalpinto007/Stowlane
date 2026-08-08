import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BackupError, makeBackup, mergeImport, parseBackup } from '../src/backup.js';
import type { Lane } from '../src/types.js';

function lane(over: Partial<Lane> = {}): Lane {
  return {
    id: over.id ?? 'lane-1',
    name: 'A lane',
    tabs: [{ url: 'https://a.com', title: 'A', site: 'a.com', pinned: false }],
    stowedAt: 1000,
    starred: false,
    ...over,
  };
}

describe('round trip', () => {
  test('exporting and importing preserves the lanes', () => {
    const original = [lane({ id: 'a' }), lane({ id: 'b', starred: true })];
    assert.deepEqual(parseBackup(JSON.stringify(makeBackup(original, 5000))).lanes, original);
  });
});

describe('parseBackup rejects bad input with a reason', () => {
  test('not JSON', () => assert.throws(() => parseBackup('{nope'), BackupError));

  test('valid JSON but a different file', () =>
    assert.throws(() => parseBackup('{"some":"other file"}'), /does not look like/));

  test('a newer format version, rather than mangling it', () => {
    const future = JSON.stringify({ format: 'stowlane.backup', version: 99, lanes: [lane()] });
    assert.throws(() => parseBackup(future), /newer version/);
  });

  test('an empty backup', () => {
    const empty = JSON.stringify({ format: 'stowlane.backup', version: 1, lanes: [] });
    assert.throws(() => parseBackup(empty), /no lanes/);
  });

  test('lanes present but all unreadable is a different problem', () => {
    // "Wrong file" and "damaged file" need different answers: only one is
    // worth going to look for a better copy of.
    const damaged = JSON.stringify({
      format: 'stowlane.backup',
      version: 1,
      lanes: [null, 'nope', { id: 'x', tabs: [] }],
    });
    assert.throws(() => parseBackup(damaged), /None of the lanes/);
  });
});

describe('parseBackup tolerates partial damage', () => {
  test('skips malformed lanes but keeps the good ones', () => {
    const mixed = JSON.stringify({
      format: 'stowlane.backup',
      version: 1,
      lanes: [lane({ id: 'good' }), { id: '', tabs: [] }, null, { id: 'y', tabs: 'nope' }],
    });
    const parsed = parseBackup(mixed);
    assert.equal(parsed.lanes.length, 1);
    assert.equal(parsed.lanes[0]?.id, 'good');
  });

  test('drops a tab with no url but keeps the rest of the lane', () => {
    const partial = JSON.stringify({
      format: 'stowlane.backup',
      version: 1,
      lanes: [{ id: 'a', tabs: [{ url: 'https://ok.com' }, { title: 'no url' }] }],
    });
    assert.equal(parseBackup(partial).lanes[0]?.tabs.length, 1);
  });

  test('falls back to the url when a tab has no title', () => {
    const noTitle = JSON.stringify({
      format: 'stowlane.backup',
      version: 1,
      lanes: [{ id: 'a', tabs: [{ url: 'https://ok.com' }] }],
    });
    assert.equal(parseBackup(noTitle).lanes[0]?.tabs[0]?.title, 'https://ok.com');
  });
});

describe('mergeImport', () => {
  test('adds lanes that are not already here', () => {
    const result = mergeImport([lane({ id: 'a' })], [lane({ id: 'b' })]);
    assert.equal(result.added, 1);
    assert.equal(result.merged.length, 2);
  });

  test('skips a lane already present rather than merging its tabs', () => {
    // Two lanes with one id are the same stow. Combining them would resurrect
    // tabs the user has since removed.
    const local = [
      lane({
        id: 'a',
        tabs: [{ url: 'https://kept.com', title: 'K', site: 'kept.com', pinned: false }],
      }),
    ];
    const incoming = [lane({ id: 'a' })];
    const { merged, added, skipped } = mergeImport(local, incoming);
    assert.equal(added, 0);
    assert.equal(skipped, 1);
    assert.equal(merged[0]?.tabs[0]?.url, 'https://kept.com');
  });
});
