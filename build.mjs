/**
 * Build the two bundles the manifest references.
 *
 * Two entry points, not three: unlike Pagefold, nothing here is injected into
 * a page. Stowlane only ever reads tab metadata through chrome.tabs, so no
 * code runs in a site's context at all.
 */
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
const common = {
  bundle: true,
  minify: true,
  target: 'chrome120',
  format: 'esm',
  logLevel: 'warning',
};

await Promise.all([
  build({ ...common, entryPoints: ['background.ts'], outfile: 'dist/background.js' }),
  build({ ...common, entryPoints: ['sidepanel.ts'], outfile: 'dist/sidepanel.js' }),
]);

for (const f of fs.readdirSync('dist')) {
  console.log(`dist/${f}  ${(fs.statSync(`dist/${f}`).size / 1024).toFixed(1)} KB`);
}
