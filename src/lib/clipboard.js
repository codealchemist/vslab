import { toBlob } from 'html-to-image';

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export const toTsv = (rows) => rows.map((r) => r.map((c) => String(c ?? '').replace(/\t|\n/g, ' ')).join('\t')).join('\n');

function surfaceColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';
}

export function nodeToBlob(node) {
  return toBlob(node, {
    pixelRatio: 2,
    backgroundColor: surfaceColor(),
    filter: (el) => !(el.dataset && el.dataset.noCapture !== undefined),
  });
}

/** Copy a DOM node (card, chart, table) to the clipboard as a PNG. */
export async function copyNodeImage(node) {
  if (!node) throw new Error('nothing to copy');
  if (typeof ClipboardItem === 'undefined') throw new Error('unsupported');
  // Passing the promise keeps Safari's user-gesture requirement satisfied.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': nodeToBlob(node) })]);
}
