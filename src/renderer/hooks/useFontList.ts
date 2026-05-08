import { useEffect, useState } from 'react';

const FALLBACK_FONTS = [
  'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS',
  'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Impact',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

interface QueryLocalFontsApi {
  queryLocalFonts?: () => Promise<{ family: string }[]>;
}

export function useFontList(): string[] {
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS);

  useEffect(() => {
    const w = window as unknown as QueryLocalFontsApi;
    if (!w.queryLocalFonts) return;
    let cancelled = false;
    w.queryLocalFonts().then((list) => {
      if (cancelled) return;
      const families = Array.from(new Set(list.map(f => f.family))).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
      if (families.length > 0) setFonts(families);
    }).catch((e) => {
      console.warn('[useFontList] queryLocalFonts failed, using fallback:', e);
    });
    return () => { cancelled = true; };
  }, []);

  return fonts;
}
