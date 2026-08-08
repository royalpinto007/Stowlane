/**
 * Generate the icon set from one SVG, so every size comes from the same source.
 * Flat fills only: the SVG rasteriser available here silently drops gradients
 * to black.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#16241f"/>
  <!-- Tabs sliding into a lane: three stacked cards, the front one squared off
       against a rail, which is the gesture the name describes. -->
  <rect x="30" y="26" width="58" height="16" rx="5" fill="#3f7a68"/>
  <rect x="30" y="48" width="58" height="16" rx="5" fill="#57a086"/>
  <rect x="30" y="70" width="58" height="16" rx="5" fill="#6fc2a8"/>
  <rect x="30" y="92" width="34" height="12" rx="4" fill="#2f4f45"/>
  <rect x="96" y="22" width="8" height="86" rx="4" fill="#cfe9df"/>
</svg>`;

fs.mkdirSync('icons', { recursive: true });
fs.writeFileSync('icons/icon.svg', svg);

for (const size of [16, 32, 48, 128, 512]) {
  execFileSync('convert', [
    '-background',
    'none',
    '-density',
    '900',
    'icons/icon.svg',
    '-resize',
    `${size}x${size}`,
    `icons/icon-${size}.png`,
  ]);
  console.log(`icons/icon-${size}.png  ${fs.statSync(`icons/icon-${size}.png`).size} B`);
}
