import { makeLane, siteOf } from './src/lane.js';
import { addLane } from './src/store.js';
import type { StowedTab } from './src/types.js';

/**
 * The service worker owns stowing.
 *
 * Stowing closes the tabs it saved, so it has to happen somewhere that
 * survives those tabs going away, and it has to work from the keyboard
 * shortcut when the panel is shut. MV3 evicts this worker aggressively, so
 * every listener is registered at the top level on each start.
 */

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'stow-window') void stowWindow();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'STOW_WINDOW') {
    stowWindow(message.keepOpen === true).then(sendResponse, (error: unknown) =>
      sendResponse({ ok: false, error: describe(error) })
    );
    // Keeps the channel open for the async response.
    return true;
  }
  if (message?.type === 'RESTORE') {
    restore(message.urls as string[], message.pinned as boolean[]).then(sendResponse, (error) =>
      sendResponse({ ok: false, error: describe(error) })
    );
    return true;
  }
  return undefined;
});

export interface StowResult {
  ok: boolean;
  name?: string;
  count?: number;
  error?: string;
}

/**
 * Put the current window's tabs into a lane.
 *
 * The panel's own tab is excluded, and so is any tab Chrome will not let us
 * restore. Closing happens only after the write resolves: losing tabs because
 * a save failed silently is the one unforgivable bug in a tool like this.
 */
async function stowWindow(keepOpen = false): Promise<StowResult> {
  const tabs = await chrome.tabs.query({ currentWindow: true });

  const stowable: StowedTab[] = [];
  const closable: number[] = [];

  for (const tab of tabs) {
    const url = tab.url ?? '';
    // Never stow or close the extension's own pages.
    if (url.startsWith('chrome-extension://')) continue;
    if (!/^(https?|file|ftp):/i.test(url)) continue;

    stowable.push({
      url,
      title: tab.title?.trim() || url,
      site: siteOf(url),
      pinned: tab.pinned === true,
    });
    if (tab.id !== undefined) closable.push(tab.id);
  }

  if (!stowable.length) {
    return { ok: false, error: 'There is nothing here that can be stowed.' };
  }

  const lane = makeLane(stowable, Date.now());
  await addLane(lane);

  if (!keepOpen) {
    // Leave one tab behind. Closing every tab in a window closes the window,
    // which takes the side panel with it and looks like a crash.
    const keep = closable.slice(0, 1);
    const toClose = closable.slice(1);
    if (toClose.length) await chrome.tabs.remove(toClose);
    for (const id of keep) {
      await chrome.tabs.update(id, { url: 'about:blank' }).catch(() => {});
    }
  }

  await notifyPanel();
  return { ok: true, name: lane.name, count: lane.tabs.length };
}

/** Open a lane's tabs in a new window. */
async function restore(urls: string[], pinned: boolean[]): Promise<{ ok: boolean }> {
  if (!urls.length) return { ok: false };

  // Create the window with the first tab, then add the rest, so the browser
  // does not briefly show an empty window.
  const [first, ...rest] = urls;
  const win = await chrome.windows.create({ url: first, focused: true });
  if (pinned[0] && win.tabs?.[0]?.id !== undefined) {
    await chrome.tabs.update(win.tabs[0].id, { pinned: true });
  }

  for (const [i, url] of rest.entries()) {
    await chrome.tabs.create({
      windowId: win.id,
      url,
      active: false,
      pinned: pinned[i + 1] === true,
    });
  }
  return { ok: true };
}

async function notifyPanel(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'LANES_CHANGED' });
  } catch {
    // Nothing listening when the panel is closed. That is the normal case.
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { stowWindow };
