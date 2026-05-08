import type { AssConfig, SrtCue } from './types.js';
import { hexToRgba } from './color-utils.js';

export interface LinePlan {
  text: string;
  leftX: number;    // center X for left eye
  rightX: number;   // center X for right eye
  y: number;        // baseline Y (increases per line downward)
  font: string;
  fontSize: number;
  fillStyle: string;
  outlineStyle: string;
  outlineWidth: number;
  shadowStyle: string;
  shadowOffset: number;
}

export interface RenderPlan {
  lines: LinePlan[];
  // Resolved scale factors — callers may need them for hit-testing etc.
  scaleX: number;
  scaleY: number;
  playResX: number;
  playResY: number;
}

export function computePlayRes(
  config: Pick<AssConfig, 'videoWidth' | 'videoHeight' | 'stereoscopyMode'>,
): { playResX: number; playResY: number } {
  const playResX =
    config.stereoscopyMode === 'half-sbs'
      ? Math.round(config.videoWidth / 2)
      : config.videoWidth;
  const playResY =
    config.stereoscopyMode === 'half-tab'
      ? Math.round(config.videoHeight / 2)
      : config.videoHeight;
  return { playResX, playResY };
}

export function buildFontString(
  config: Pick<AssConfig, 'fontName' | 'italic' | 'bold'>,
  scaledFontSize: number,
): string {
  const style = config.italic ? 'italic ' : '';
  const weight = config.bold ? 'bold ' : '';
  return `${style}${weight}${scaledFontSize}px "${config.fontName}", Arial`;
}

export function computeBaselineY(
  config: Pick<AssConfig, 'marginV'>,
  canvasH: number,
  scaleY: number,
  lineCount: number,
  lineHeight: number,
): number {
  // Bottom of the last line sits at marginV above the canvas bottom.
  // We walk up from there: baseY is the baseline of the FIRST line.
  const bottomEdge = canvasH - Math.round(config.marginV * scaleY);
  return bottomEdge - lineHeight * (lineCount - 1);
}

export function buildRenderPlan(
  config: AssConfig,
  activeCues: SrtCue[],
  canvasW: number,
  canvasH: number,
): RenderPlan {
  const { playResX, playResY } = computePlayRes(config);
  const scaleX = canvasW / playResX;
  const scaleY = canvasH / playResY;

  const scaledFontSize = Math.round(config.fontSize * scaleY);
  const lineHeight = scaledFontSize * 1.2;
  const font = buildFontString(config, scaledFontSize);

  const halfDepth = (config.depthOffset / 2) * scaleX;
  const centerBase = canvasW / 2;
  const leftX = centerBase - halfDepth;
  const rightX = centerBase + halfDepth;

  const fillStyle = hexToRgba(config.primaryColor, 1 - config.primaryAlpha);
  const outlineStyle = hexToRgba(config.outlineColor, 1 - config.outlineAlpha);
  const outlineWidth = config.outline * 2 * Math.min(scaleX, scaleY);
  const shadowStyle = hexToRgba(config.backColor, 1 - config.backAlpha);
  const shadowOffset = config.shadow * Math.min(scaleX, scaleY);

  const lines: LinePlan[] = [];

  for (const cue of activeCues) {
    const baseY = computeBaselineY(config, canvasH, scaleY, cue.lines.length, lineHeight);
    cue.lines.forEach((text, i) => {
      lines.push({
        text,
        leftX,
        rightX,
        y: baseY + i * lineHeight,
        font,
        fontSize: scaledFontSize,
        fillStyle,
        outlineStyle,
        outlineWidth,
        shadowStyle,
        shadowOffset,
      });
    });
  }

  return { lines, scaleX, scaleY, playResX, playResY };
}

// Returns the cues that are active at the given timestamp (ms).
export function getActiveCues(cues: SrtCue[], timeMs: number): SrtCue[] {
  return cues.filter((c) => c.startMs <= timeMs && timeMs < c.endMs);
}
