function normalizeHex(hex: string): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return h.toUpperCase();
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase();
}

export function htmlToAssColor(hex: string, alpha: number = 0): string {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const a = Math.round(clampedAlpha * 255);
  return `&H${hex2(a)}${hex2(b)}${hex2(g)}${hex2(r)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
