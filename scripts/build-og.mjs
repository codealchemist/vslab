// Renders the social preview image and touch icon into public/.
//   npm run og
// Edit the SVG templates below, then re-run. Output PNGs are committed so builds don't need this step.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';

const out = new URL('../public/', import.meta.url);

// resvg reads TrueType/OpenType only; @fontsource ships WOFF, so unwrap it (WOFF 1.0 = zlib-compressed sfnt tables).
function woffToTtf(buf) {
  const numTables = buf.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const [tag, offset, compLength, origLength, checksum] = [
      buf.readUInt32BE(o), buf.readUInt32BE(o + 4), buf.readUInt32BE(o + 8), buf.readUInt32BE(o + 12), buf.readUInt32BE(o + 16),
    ];
    const raw = buf.subarray(offset, offset + compLength);
    tables.push({ tag, checksum, data: compLength < origLength ? inflateSync(raw) : raw });
  }
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(buf.readUInt32BE(4), 0); // sfnt flavor
  header.writeUInt16BE(numTables, 4);
  let pos = header.length;
  const bodies = [];
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    header.writeUInt32BE(t.tag, o);
    header.writeUInt32BE(t.checksum, o + 4);
    header.writeUInt32BE(pos, o + 8);
    header.writeUInt32BE(t.data.length, o + 12);
    const padded = Buffer.alloc((t.data.length + 3) & ~3);
    t.data.copy(padded);
    bodies.push(padded);
    pos += padded.length;
  });
  return Buffer.concat([header, ...bodies]);
}

// resvg's Node API only loads fonts from files, so the unwrapped TTFs go to a temp folder.
const fontDir = mkdtempSync(join(tmpdir(), 'vslab-og-'));
const fontFiles = [400, 600, 700].map((w) => {
  const file = join(fontDir, `inter-${w}.ttf`);
  writeFileSync(file, woffToTtf(readFileSync(new URL(`../node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff`, import.meta.url))));
  return file;
});

function render(svg, width, file) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  }).render().asPng();
  writeFileSync(new URL(file, out), png);
  console.log(`${file}: ${(png.length / 1024).toFixed(0)} KB`);
}

// Flask mark from public/favicon.svg (drawn on a 32-unit grid).
const FLASK = 'M12 7h8M14 7v7l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V7';

const OG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glowA" cx="10%" cy="-10%" r="75%">
      <stop offset="0" stop-color="#14b8a6" stop-opacity="0.22"/><stop offset="1" stop-color="#14b8a6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="100%" cy="0%" r="60%">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.16"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#14b8a6"/>
    </linearGradient>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3987e5" stop-opacity="0.35"/><stop offset="1" stop-color="#3987e5" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#0f0f0e"/>
  <rect width="1200" height="630" fill="url(#glowA)"/>
  <rect width="1200" height="630" fill="url(#glowB)"/>

  <!-- Brand -->
  <rect x="80" y="96" width="112" height="112" rx="32" fill="url(#mark)"/>
  <g transform="translate(80 96) scale(3.5)">
    <path d="${FLASK}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="80" y="330" font-family="Inter" font-weight="700" font-size="112" letter-spacing="-4" fill="#f4f4f1">VSLab</text>
  <text x="84" y="392" font-family="Inter" font-weight="400" font-size="36" fill="#c3c2b7">Compare your lab results, beautifully</text>

  <!-- Feature chips -->
  <g font-family="Inter" font-weight="600" font-size="22" fill="#c3c2b7">
    <rect x="80" y="456" width="150" height="48" rx="24" fill="#1f1f1d" stroke="#3a3a37"/>
    <text x="155" y="488" text-anchor="middle">Timeline</text>
    <rect x="246" y="456" width="214" height="48" rx="24" fill="#1f1f1d" stroke="#3a3a37"/>
    <text x="353" y="488" text-anchor="middle">VS your friends</text>
    <rect x="476" y="456" width="226" height="48" rx="24" fill="#1f1f1d" stroke="#3a3a37"/>
    <text x="589" y="488" text-anchor="middle">9 lab standards</text>
  </g>

  <!-- Product card: score ring + biomarker trend with optimal band -->
  <g transform="translate(780 120)">
    <rect width="340" height="390" rx="28" fill="#1a1a19" stroke="#2b2b29"/>
    <circle cx="170" cy="118" r="66" fill="none" stroke="#262624" stroke-width="12"/>
    <circle cx="170" cy="118" r="66" fill="none" stroke="#0ca30c" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="414.7" stroke-dashoffset="45.6" transform="rotate(-90 170 118)"/>
    <text x="170" y="134" text-anchor="middle" font-family="Inter" font-weight="700" font-size="48" letter-spacing="-2" fill="#f4f4f1">89</text>
    <text x="170" y="222" text-anchor="middle" font-family="Inter" font-weight="600" font-size="16" letter-spacing="2" fill="#8a8981">GLOBAL SCORE</text>
    <rect x="40" y="262" width="260" height="56" fill="#0ca30c" fill-opacity="0.16"/>
    <path d="M40 345 C 90 330, 120 300, 160 296 S 230 280, 300 270 L 300 360 L 40 360 Z" fill="url(#area)"/>
    <path d="M40 345 C 90 330, 120 300, 160 296 S 230 280, 300 270" fill="none" stroke="#3987e5" stroke-width="4" stroke-linecap="round"/>
    <g stroke="#1a1a19" stroke-width="4">
      <circle cx="40" cy="345" r="9" fill="#d03b3b"/>
      <circle cx="160" cy="296" r="9" fill="#4f9d8f"/>
      <circle cx="300" cy="270" r="9" fill="#0ca30c"/>
    </g>
  </g>
</svg>`;

const TOUCH = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs>
  <rect width="32" height="32" fill="url(#g)"/>
  <g transform="translate(3.2 3.2) scale(0.8)">
    <path d="${FLASK}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

render(OG, 1200, 'og-image.png');
render(TOUCH, 180, 'apple-touch-icon.png');
