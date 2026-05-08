import type { AssConfig, SrtCue } from './types.js';
import { buildRenderPlan, type RenderPlan } from './subtitle-layout.js';

// Executes a RenderPlan against a 2D canvas context.
// This file is intentionally thin — all geometry lives in subtitle-layout.ts.
export function executePlan(
  ctx: CanvasRenderingContext2D,
  plan: RenderPlan,
  eyeSide: 'left' | 'right' = 'left',
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  for (const line of plan.lines) {
    const x = eyeSide === 'left' ? line.leftX : line.rightX;

    ctx.font = line.font;

    if (line.shadowOffset > 0) {
      ctx.fillStyle = line.shadowStyle;
      ctx.fillText(line.text, x + line.shadowOffset, line.y + line.shadowOffset);
    }

    if (line.outlineWidth > 0) {
      ctx.strokeStyle = line.outlineStyle;
      ctx.lineWidth = line.outlineWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(line.text, x, line.y);
    }

    ctx.fillStyle = line.fillStyle;
    ctx.fillText(line.text, x, line.y);
  }
}

// Renders the anaglyph composite: red text at the left-eye position, cyan text
// at the right-eye position, additively blended so depth disparity becomes the
// classic red/cyan ghosting that 3D glasses fuse.
export function executeAnaglyphPlan(ctx: CanvasRenderingContext2D, plan: RenderPlan): void {
  const savedComposite = ctx.globalCompositeOperation;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // 'lighter' = additive RGB blend. Drawing red and cyan at the same pixel → white.
  ctx.globalCompositeOperation = 'lighter';

  for (const eye of ['left', 'right'] as const) {
    const tint = eye === 'left' ? '#ff0000' : '#00ffff';
    for (const line of plan.lines) {
      const x = eye === 'left' ? line.leftX : line.rightX;
      ctx.font = line.font;

      if (line.outlineWidth > 0) {
        ctx.strokeStyle = tint;
        ctx.lineWidth = line.outlineWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(line.text, x, line.y);
      }
      ctx.fillStyle = tint;
      ctx.fillText(line.text, x, line.y);
    }
  }

  ctx.globalCompositeOperation = savedComposite;
}

// Convenience wrapper: build plan + execute in one call.
export function renderSubtitlePreview(
  ctx: CanvasRenderingContext2D,
  config: AssConfig,
  activeCues: SrtCue[],
  canvasW: number,
  canvasH: number,
  eyeSide: 'left' | 'right' = 'left',
): void {
  const plan = buildRenderPlan(config, activeCues, canvasW, canvasH);
  executePlan(ctx, plan, eyeSide);
}
