import { allLanes, deleteLane, saveLanes, updateLane, clearAll, usageBytes } from './src/store.js';
import { applyFilters, matchingTabs, parseQuery } from './src/search.js';
import { bucketOf, compactCount, formatBytes, tabLabel } from './src/format.js';
import { totalTabs, withoutTab } from './src/lane.js';
import { makeBackup, parseBackup, mergeImport, BackupError } from './src/backup.js';
import type { Filters, Lane } from './src/types.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element: ${id}`);
  return el as T;
};

const els = {
  count: $('count'),
  list: $('list'),
  stow: $<HTMLButtonElement>('stow-btn'),
  keepOpen: $<HTMLInputElement>('keep-open'),
  search: $<HTMLInputElement>('search'),
  sort: $<HTMLSelectElement>('sort'),
  starredOnly: $<HTMLInputElement>('starred-only'),
  settings: $('settings'),
  settingsBtn: $('settings-btn'),
  settingsBack: $('settings-back'),
  storageLine: $('storage-line'),
  exportBtn: $('export-btn'),
  importBtn: $('import-btn'),
  importFile: $<HTMLInputElement>('import-file'),
  clearBtn: $('clear-btn'),
  toast: $('toast'),
};

let lanes: Lane[] = [];
const expanded = new Set<string>();
const filters: Filters = { query: '', sort: 'newest', starredOnly: false };

/** Text nodes only. Tab titles come from arbitrary pages, so they are never
 *  interpolated into markup: a title containing a tag would otherwise render
 *  as one inside the extension's own privileged page. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let toastTimer: number | undefined;
function toast(message: string): void {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 2600);
}

async function refresh(): Promise<void> {
  lanes = await allLanes();
  render();
}

function render(): void {
  const rows = applyFilters(lanes, filters);
  const terms = parseQuery(filters.query);

  els.count.textContent = lanes.length ? `${compactCount(totalTabs(lanes))} tabs` : '';
  els.list.replaceChildren();

  if (!rows.length) {
    const empty = el('div', 'empty');
    empty.append(
      el('strong', undefined, lanes.length ? 'Nothing matches' : 'No lanes yet'),
      el(
        'span',
        undefined,
        lanes.length
          ? 'Try a different word, or clear the search.'
          : 'Press Stow this window and your tabs are put away, ready to come back.'
      )
    );
    els.list.append(empty);
    return;
  }

  const now = Date.now();
  let bucket = '';
  for (const lane of rows) {
    // Date headings only make sense while the list is in date order, and
    // starred lanes float above everything, so they would break the grouping.
    if ((filters.sort === 'newest' || filters.sort === 'oldest') && !lane.starred) {
      const next = bucketOf(lane.stowedAt, now);
      if (next !== bucket) {
        bucket = next;
        els.list.append(el('div', 'bucket', next));
      }
    }
    els.list.append(laneCard(lane, terms));
  }
}

function laneCard(lane: Lane, terms: readonly string[]): HTMLElement {
  const card = el('div', 'lane');

  const head = el('button', 'lane-head');
  head.setAttribute('aria-expanded', String(expanded.has(lane.id)));

  const star = el('span', `star${lane.starred ? ' on' : ''}`, lane.starred ? '★' : '☆');
  star.setAttribute('role', 'button');
  star.setAttribute('tabindex', '0');
  star.setAttribute('aria-label', lane.starred ? 'Unstar this lane' : 'Star this lane');
  const toggleStar = (e: Event) => {
    e.stopPropagation();
    void updateLane(lane.id, (l) => ({ ...l, starred: !l.starred })).then(refresh);
  };
  star.addEventListener('click', toggleStar);
  star.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') toggleStar(e);
  });

  head.append(
    star,
    el('span', 'lane-title', lane.name),
    el('span', 'lane-sub', tabLabel(lane.tabs.length))
  );
  head.addEventListener('click', () => {
    if (expanded.has(lane.id)) expanded.delete(lane.id);
    else expanded.add(lane.id);
    render();
  });
  card.append(head);

  if (expanded.has(lane.id)) card.append(laneBody(lane, terms));
  return card;
}

function laneBody(lane: Lane, terms: readonly string[]): HTMLElement {
  const body = el('div', 'lane-body');

  for (const tab of matchingTabs(lane, terms)) {
    const row = el('div', 'tab-row');

    const link = el('a', 'tab-title', tab.title);
    link.href = tab.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = tab.url;

    const drop = el('button', 'tab-drop', '×');
    drop.setAttribute('aria-label', `Remove ${tab.title} from this lane`);
    drop.addEventListener('click', () => {
      void updateLane(lane.id, (l) => withoutTab(l, tab.url)).then(refresh);
    });

    row.append(link, el('span', 'tab-site', tab.site), drop);
    body.append(row);
  }

  const actions = el('div', 'lane-actions');

  const restore = el('button', 'ghost', 'Restore all');
  restore.addEventListener('click', () => void restoreLane(lane));

  const rename = el('button', 'ghost', 'Rename');
  rename.addEventListener('click', () => {
    const name = prompt('Name this lane', lane.name);
    if (name === null) return;
    void updateLane(lane.id, (l) => ({ ...l, name: name.trim() || l.name })).then(refresh);
  });

  const remove = el('button', 'ghost danger', 'Delete lane');
  remove.addEventListener('click', () => {
    if (!confirm(`Delete "${lane.name}" and its ${lane.tabs.length} tabs?`)) return;
    expanded.delete(lane.id);
    void deleteLane(lane.id).then(refresh);
    toast(`Deleted “${lane.name}”`);
  });

  actions.append(restore, rename, remove);
  body.append(actions);
  return body;
}

async function restoreLane(lane: Lane): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    type: 'RESTORE',
    urls: lane.tabs.map((t) => t.url),
    pinned: lane.tabs.map((t) => t.pinned),
  });
  if (result?.ok) toast(`Restored ${tabLabel(lane.tabs.length)}`);
  else toast('Could not restore that lane.');
}

async function stow(): Promise<void> {
  els.stow.disabled = true;
  els.stow.textContent = 'Stowing…';
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'STOW_WINDOW',
      keepOpen: els.keepOpen.checked,
    });
    if (result?.ok) {
      toast(`Stowed ${tabLabel(result.count)} as “${result.name}”`);
      await refresh();
    } else {
      toast(result?.error ?? 'Could not stow this window.');
    }
  } catch {
    toast('Could not reach the extension. Try reloading it.');
  } finally {
    els.stow.disabled = false;
    els.stow.textContent = 'Stow this window';
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function wire(): void {
  els.stow.addEventListener('click', () => void stow());

  els.search.addEventListener('input', () => {
    filters.query = els.search.value;
    // A search is only useful if the matching tabs are visible, so expand
    // everything that matched rather than making the user click each lane.
    if (parseQuery(filters.query).length) {
      for (const lane of applyFilters(lanes, filters)) expanded.add(lane.id);
    }
    render();
  });
  els.sort.addEventListener('change', () => {
    filters.sort = els.sort.value as Filters['sort'];
    render();
  });
  els.starredOnly.addEventListener('change', () => {
    filters.starredOnly = els.starredOnly.checked;
    render();
  });

  els.settingsBtn.addEventListener('click', () => {
    els.settings.hidden = false;
    void usageBytes().then((bytes) => {
      els.storageLine.textContent = `${lanes.length} lane${lanes.length === 1 ? '' : 's'} holding ${tabLabel(totalTabs(lanes))}, using about ${formatBytes(bytes)}.`;
    });
  });
  els.settingsBack.addEventListener('click', () => {
    els.settings.hidden = true;
  });

  els.exportBtn.addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`stowlane-${stamp}.json`, JSON.stringify(makeBackup(lanes, Date.now()), null, 2));
    toast(`Exported ${lanes.length} lane${lanes.length === 1 ? '' : 's'}`);
  });

  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const { merged, added, skipped } = mergeImport(lanes, backup.lanes);
      await saveLanes(merged);
      await refresh();
      toast(skipped ? `Imported ${added}, skipped ${skipped} already here` : `Imported ${added}`);
    } catch (error) {
      toast(error instanceof BackupError ? error.message : 'That file could not be imported.');
    } finally {
      // Reset, so picking the same file again still fires a change event.
      els.importFile.value = '';
    }
  });

  els.clearBtn.addEventListener('click', () => {
    if (!confirm(`Delete all ${lanes.length} lanes? This cannot be undone.`)) return;
    expanded.clear();
    void clearAll().then(refresh);
    toast('All lanes deleted');
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'LANES_CHANGED') void refresh();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.settings.hidden) els.settings.hidden = true;
  });
}

wire();
void refresh();
