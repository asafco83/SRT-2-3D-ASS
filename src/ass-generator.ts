import type { AssConfig, SrtCue } from './types.js';
import { htmlToAssColor } from './color-utils.js';

export function msToAssTime(ms: number): string {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const cs = Math.floor((ms % 1_000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function computePlayRes(config: AssConfig, singleEye: boolean): { x: number; y: number } {
  // Anamorphic squeeze of the encoding (half-sbs / half-tab) is handled by
  // doubling the PlayRes coordinate space along the squeezed axis. This correctly
  // scales the font glyphs, character spacing, and outline thicknesses perfectly
  // without relying on ScaleX/ScaleY tags.
  let x = config.videoWidth;
  let y = config.videoHeight;
  if (!singleEye) {
    if (config.stereoscopyMode === 'half-sbs') x *= 2;
    if (config.stereoscopyMode === 'half-tab') y *= 2;
  }
  return { x, y };
}

// ASS hex colour format is &HBBGGRR&. Pure red in BGR is 0000FF; cyan = FFFF00.
// Black outline (rather than coloured) keeps each eye's text crisp against the
// blend filter — the lighten compositor in mpv merges only the bright red+cyan
// fills into white, while shared black outlines stay shared.
const ANAGLYPH_LEFT_OVERRIDE  = '{\\c&H0000FF&\\3c&H000000&}';   // red fill, black outline
const ANAGLYPH_RIGHT_OVERRIDE = '{\\c&HFFFF00&\\3c&H000000&}';   // cyan fill, black outline

export type AnaglyphEye = 'left' | 'right';

export function generateAss(
  config: AssConfig,
  cues: SrtCue[],
  anaglyphPreview = false,
  eyeFilter?: AnaglyphEye,
  // singleEye: position subs at the visible-frame center for a per-eye preview
  // (mpv crops to one eye and scales back to full size, so the ASS coordinate
  // system maps onto a single eye's view). The export pipeline keeps this
  // false — it needs the two-sub full-SBS-frame layout.
  singleEye = false,
): string {
  const { x: playResX, y: playResY } = computePlayRes(config, singleEye);

  const scriptInfo = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    `WrapStyle: ${config.wrapStyle}`,
    'ScaledBorderAndShadow: yes',
    '',
  ].join('\n');

  const formatLine =
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

  // Anamorphic compensation is now handled by the PlayRes grid directly mapping
  // to the unsqueezed video dimensions, which correctly squishes text, outlines,
  // and spacing seamlessly without needing ScaleX/ScaleY hacks.
  const effectiveScaleX = config.scaleX;
  const effectiveScaleY = config.scaleY;

  const styleLine =
    `Style: Default,${config.fontName},${config.fontSize},` +
    `${htmlToAssColor(config.primaryColor, config.primaryAlpha)},` +
    `${htmlToAssColor(config.primaryColor, 0.5)},` +
    `${htmlToAssColor(config.outlineColor, config.outlineAlpha)},` +
    `${htmlToAssColor(config.backColor, config.backAlpha)},` +
    `${config.bold ? '-1' : '0'},` +
    `${config.italic ? '-1' : '0'},` +
    `${config.underline ? '-1' : '0'},` +
    `${config.strikeout ? '-1' : '0'},` +
    `${effectiveScaleX},${effectiveScaleY},${config.spacing},${config.angle},` +
    `${config.borderStyle},${config.outline},${config.shadow},` +
    `${config.alignment},${config.marginL},${config.marginR},${config.marginV},1`;

  const stylesSection = ['[V4+ Styles]', formatLine, styleLine, ''].join('\n');

  const eventsHeader =
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';
  const dialogueLines: string[] = ['[Events]', eventsHeader];

  for (const cue of cues) {
    let startMs = Math.round(cue.startMs * config.timingSpeedMultiplier) + config.timingOffsetMs;
    let endMs = Math.round(cue.endMs * config.timingSpeedMultiplier) + config.timingOffsetMs;
    startMs = Math.max(0, startMs);
    endMs = Math.max(startMs + 100, endMs);

    const start = msToAssTime(startMs);
    const end = msToAssTime(endMs);
    const text = cue.lines.join('\\N');

    const isTab = config.stereoscopyMode === 'half-tab' || config.stereoscopyMode === 'full-tab';
    const leftPrefix  = anaglyphPreview ? ANAGLYPH_LEFT_OVERRIDE  : '';
    const rightPrefix = anaglyphPreview ? ANAGLYPH_RIGHT_OVERRIDE : '';

    const wantLeft  = eyeFilter !== 'right';
    const wantRight = eyeFilter !== 'left';

    const scaleX = playResX / config.videoWidth;
    const scaleY = playResY / config.videoHeight;
    const halfDepth = (config.depthOffset / 2) * scaleX;
    const halfVert  = (config.verticalOffset / 2) * scaleY;

    let leftX: number, rightX: number, leftY: number, rightY: number;

    if (singleEye) {
      // Per-eye preview: the lavfi pipeline already crops & unsqueezes the
      // visible eye to the full visible frame. Center the sub horizontally
      // with a depth shift; marginV maps directly to display-pixels.
      const subY = playResY - config.marginV;
      leftX  = Math.round(playResX / 2 - halfDepth);
      rightX = Math.round(playResX / 2 + halfDepth);
      leftY  = subY - Math.round(halfVert);
      rightY = subY + Math.round(halfVert);
    } else if (isTab) {
      // Export — TAB: top eye in upper half of encoded frame, bottom eye in
      // lower half. With PlayResY doubled for half-tab, the top eye spans
      // 0 to playResY / 2.
      const effMargin = config.marginV * scaleY;
      leftX  = Math.round(playResX / 2 - halfDepth);
      rightX = Math.round(playResX / 2 + halfDepth);
      leftY  = Math.round(playResY / 2 - effMargin - halfVert);  // bottom of top eye
      rightY = Math.round(playResY - effMargin + halfVert);      // bottom of bottom eye
    } else {
      // Export — SBS: each eye occupies a horizontal half. playResX/4 and
      // 3*playResX/4 land at the centers of the two eye-frames.
      const baseY = playResY - (config.marginV * scaleY);
      leftX  = Math.round(playResX / 4 - halfDepth);
      rightX = Math.round(3 * playResX / 4 + halfDepth);
      leftY  = Math.round(baseY - halfVert);
      rightY = Math.round(baseY + halfVert);
    }

    if (wantLeft) dialogueLines.push(
      `Dialogue: 0,${start},${end},Default,,0,0,0,,${leftPrefix}{\\pos(${leftX},${leftY})}${text}`,
    );
    if (wantRight) dialogueLines.push(
      `Dialogue: 1,${start},${end},Default,,0,0,0,,${rightPrefix}{\\pos(${rightX},${rightY})}${text}`,
    );
  }

  return [scriptInfo, stylesSection, dialogueLines.join('\n')].join('\n');
}

export function withBom(content: string, encoding: 'utf-8' | 'utf-8-bom'): string {
  return encoding === 'utf-8-bom' ? '﻿' + content : content;
}
