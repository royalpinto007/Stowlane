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
  expandAll: $<HTMLButtonElement>('expand-all'),
  keepOpen: $<HTMLInputElement>('keep-open'),
  search: $<HTMLInputElement>('search'),
  searchClear: $<HTMLButtonElement>('search-clear'),
  resultsMeta: $('results-meta'),
  sort: $<HTMLSelectElement>('sort'),
  starredOnly: $<HTMLInputElement>('starred-only'),
  settings: $('settings'),
  settingsBtn: $('settings-btn'),
  settingsBack: $('settings-back'),
  storageLine: $('storage-line'),
  storageMeter: $('storage-meter'),
  exportBtn: $('export-btn'),
  importBtn: $('import-btn'),
  importFile: $<HTMLInputElement>('import-file'),
  clearBtn: $('clear-btn'),
  toast: $('toast'),
  toastText: $('toast-text'),
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
  els.toastText.textContent = message;
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
  const tabs = totalTabs(lanes);

  els.count.textContent = lanes.length ? `${compactCount(tabs)} tabs` : '';
  els.searchClear.hidden = !filters.query;

  if (!lanes.length) {
    els.resultsMeta.textContent = '';
  } else if (filters.query || filters.starredOnly) {
    els.resultsMeta.textContent = `${rows.length} of ${lanes.length} lanes · ${tabs} tabs stowed`;
  } else {
    els.resultsMeta.textContent = `${lanes.length} lane${lanes.length === 1 ? '' : 's'} · ${tabs} tabs stowed`;
  }

  const allOpen = rows.length > 0 && rows.every((l) => expanded.has(l.id));
  els.expandAll.textContent = allOpen ? 'Collapse' : 'Expand';

  els.list.replaceChildren();

  if (!rows.length) {
    const empty = el('div', 'empty');
    const art = el('div', 'empty-art', lanes.length ? '🔍' : '🧳');
    art.setAttribute('aria-hidden', 'true');
    empty.append(
      art,
      el('strong', undefined, lanes.length ? 'Nothing matches' : 'A calmer tab bar awaits'),
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

function avatarLetter(name: string): string {
  const clean = name.trim().replace(/^["“”']+/, '');
  return (clean.charAt(0) || 'L').toUpperCase();
}

function laneCard(lane: Lane, terms: readonly string[]): HTMLElement {
  const isOpen = expanded.has(lane.id);
  const card = el('div', `lane${isOpen ? ' open' : ''}`);

  const head = el('button', 'lane-head');
  head.setAttribute('aria-expanded', String(isOpen));
  head.setAttribute(
    'aria-label',
    `${lane.name}, ${tabLabel(lane.tabs.length)}${lane.starred ? ', starred' : ''}`
  );

  const avatar = el('span', 'lane-avatar', avatarLetter(lane.name));
  avatar.setAttribute('aria-hidden', 'true');

  const titles = el('span', 'lane-titles');
  titles.append(el('span', 'lane-title', lane.name), el('span', 'lane-sub', subtitle(lane)));

  const count = el('span', 'lane-count', String(lane.tabs.length));
  count.title = tabLabel(lane.tabs.length);

  const star = el('button', `star${lane.starred ? ' on' : ''}`, lane.starred ? '★' : '☆');
  star.type = 'button';
  star.setAttribute('aria-label', lane.starred ? 'Unstar this lane' : 'Star this lane');
  star.setAttribute('aria-pressed', String(lane.starred));
  star.addEventListener('click', (e) => {
    e.stopPropagation();
    void updateLane(lane.id, (l) => ({ ...l, starred: !l.starred })).then(refresh);
  });

  const chev = el('span', 'chev', '▾');
  chev.setAttribute('aria-hidden', 'true');

  head.append(avatar, titles, count, star, chev);
  head.addEventListener('click', () => {
    if (expanded.has(lane.id)) expanded.delete(lane.id);
    else expanded.add(lane.id);
    render();
  });
  card.append(head);

  if (isOpen) card.append(laneBody(lane, terms));
  return card;
}

function subtitle(lane: Lane): string {
  const date = new Date(lane.stowedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const sites = [...new Set(lane.tabs.map((t) => t.site).filter(Boolean))].slice(0, 2).join(' · ');
  return [date, sites].filter(Boolean).join(' · ');
}

function laneBody(lane: Lane, terms: readonly string[]): HTMLElement {
  const body = el('div', 'lane-body');

  for (const tab of matchingTabs(lane, terms)) {
    const row = el('div', 'tab-row');

    const fav = el('span', 'tab-fav', (tab.site || tab.title || '?').charAt(0).toUpperCase());
    fav.setAttribute('aria-hidden', 'true');

    const main = el('span', 'tab-main');
    const link = el('a', 'tab-title', tab.title) as HTMLAnchorElement;
    link.href = tab.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = `${tab.title} — ${tab.url}`;
    main.append(link, el('span', 'tab-site', tab.site));

    const drop = el('button', 'tab-drop', '×');
    drop.setAttribute('aria-label', `Remove ${tab.title} from this lane`);
    drop.addEventListener('click', () => {
      void updateLane(lane.id, (l) => withoutTab(l, tab.url)).then(refresh);
    });

    row.append(fav, main, drop);
    body.append(row);
  }

  const actions = el('div', 'lane-actions');

  const restore = el(
    'button',
    'ghost primary-mini',
    lane.tabs.length > 3 ? `Restore all ${lane.tabs.length}` : 'Restore all'
  );
  restore.addEventListener('click', () => void restoreLane(lane));

  const rename = el('button', 'ghost', 'Rename');
  rename.addEventListener('click', () => {
    const name = prompt('Name this lane', lane.name);
    if (name === null) return;
    void updateLane(lane.id, (l) => ({ ...l, name: name.trim() || l.name })).then(refresh);
  });

  const remove = el('button', 'ghost danger', 'Delete');
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

function setStowBusy(busy: boolean): void {
  els.stow.disabled = busy;
  els.stow.classList.toggle('is-busy', busy);
  const label = els.stow.querySelector('.primary-label');
  if (label) label.textContent = busy ? 'Stowing' : 'Stow this window';
}

async function stow(): Promise<void> {
  setStowBusy(true);
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
    setStowBusy(false);
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

  els.expandAll.addEventListener('click', () => {
    const rows = applyFilters(lanes, filters);
    const allOpen = rows.length > 0 && rows.every((l) => expanded.has(l.id));
    if (allOpen) expanded.clear();
    else for (const lane of rows) expanded.add(lane.id);
    render();
  });

  els.search.addEventListener('input', () => {
    filters.query = els.search.value;
    // A search is only useful if the matching tabs are visible, so expand
    // everything that matched rather than making the user click each lane.
    if (parseQuery(filters.query).length) {
      for (const lane of applyFilters(lanes, filters)) expanded.add(lane.id);
    }
    render();
  });
  els.searchClear.addEventListener('click', () => {
    els.search.value = '';
    filters.query = '';
    render();
    els.search.focus();
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
      els.storageLine.textContent = `${lanes.length} lane${lanes.length === 1 ? '' : 's'} · ${tabLabel(totalTabs(lanes))} · about ${formatBytes(bytes)}`;
      els.storageMeter.style.width = `${Math.min(100, (bytes / (5 * 1024 * 1024)) * 100)}%`;
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
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    if (event.key === 'Escape' && !els.settings.hidden) els.settings.hidden = true;
    else if (event.key === '/' && !typing) {
      event.preventDefault();
      els.search.focus();
    }
  });
}

wire();
void refresh();
