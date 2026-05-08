import type { SrtCue } from './types.js';

const TIMECODE_RE =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function timecodeToMs(h: string, m: string, s: string, ms: string): number {
  return (
    parseInt(h, 10) * 3_600_000 +
    parseInt(m, 10) * 60_000 +
    parseInt(s, 10) * 1_000 +
    parseInt(ms.padEnd(3, '0').slice(0, 3), 10)
  );
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function htmlToAssInline(text: string): { plain: string; ass: string } {
  let ass = text;
  ass = ass.replace(/<\s*b\s*>/gi, '{\\b1}').replace(/<\s*\/\s*b\s*>/gi, '{\\b0}');
  ass = ass.replace(/<\s*i\s*>/gi, '{\\i1}').replace(/<\s*\/\s*i\s*>/gi, '{\\i0}');
  ass = ass.replace(/<\s*u\s*>/gi, '{\\u1}').replace(/<\s*\/\s*u\s*>/gi, '{\\u0}');
  ass = ass.replace(/<\s*font[^>]*>/gi, '').replace(/<\s*\/\s*font\s*>/gi, '');
  ass = ass.replace(/<[^>]+>/g, '');

  const plain = text.replace(/<[^>]+>/g, '');
  return { plain, ass };
}

export function parseSrt(input: string): SrtCue[] {
  const text = stripBom(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text.split(/\n\s*\n/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, ''));
    while (lines.length && lines[0].trim() === '') lines.shift();
    if (lines.length === 0) continue;

    let idx = 0;
    let index = cues.length + 1;
    const maybeIdx = lines[0].trim();
    if (/^\d+$/.test(maybeIdx)) {
      index = parseInt(maybeIdx, 10);
      idx = 1;
    }

    if (idx >= lines.length) continue;
    const tcLine = lines[idx];
    const m = TIMECODE_RE.exec(tcLine);
    if (!m) continue;

    const startMs = timecodeToMs(m[1], m[2], m[3], m[4]);
    const endMs = timecodeToMs(m[5], m[6], m[7], m[8]);

    const textLines = lines.slice(idx + 1).filter((l) => l.length > 0);
    const rawText = textLines.join('\n');
    const { ass } = htmlToAssInline(rawText);
    const assLines = ass.split('\n');

    cues.push({
      index,
      startMs,
      endMs,
      text: ass,
      lines: assLines,
    });
  }

  return cues;
}
