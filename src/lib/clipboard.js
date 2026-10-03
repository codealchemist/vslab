import { toBlob } from 'html-to-image';

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export const toTsv = (rows) => rows.map((r) => r.map((c) => String(c ?? '').replace(/\t|\n/g, ' ')).join('\t')).join('\n');

function surfaceColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';
}

export function nodeToBlob(node, background = surfaceColor(), style) {
  return toBlob(node, {
    pixelRatio: 2,
    backgroundColor: background,
    ...(style && { style }),
    filter: (el) => !(el.dataset && el.dataset.noCapture !== undefined),
  });
}

/**
 * Copy a DOM node (card, chart, table) to the clipboard as a PNG.
 * `background` defaults to the surface colour; `style` overrides the copied root's style
 * (e.g. square corners, so nothing shows outside a rounded border).
 */
/** Root style for copied cards: a plain rectangle, so nothing shows outside rounded corners. */
export const SQUARE_STYLE = { borderRadius: '0', border: 'none', margin: '0' };

export async function copyNodeImage(node, background, style) {
  if (!node) throw new Error('nothing to copy');
  if (typeof ClipboardItem === 'undefined') throw new Error('unsupported');
  // Passing the promise keeps Safari's user-gesture requirement satisfied.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': nodeToBlob(node, background, style) })]);
}
