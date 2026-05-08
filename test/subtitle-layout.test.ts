import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePlayRes,
  buildFontString,
  computeBaselineY,
  buildRenderPlan,
  getActiveCues,
} from '../src/subtitle-layout.js';
import { defaultConfig, type AssConfig, type SrtCue } from '../src/types.js';

function cfg(overrides: Partial<AssConfig> = {}): AssConfig {
  return { ...defaultConfig, videoWidth: 1920, videoHeight: 1080, ...overrides };
}

const oneCue: SrtCue[] = [
  { index: 1, startMs: 1000, endMs: 3000, text: 'Hello', lines: ['Hello'] },
];

const twoCue: SrtCue[] = [
  { index: 1, startMs: 0, endMs: 2000, text: 'Line A\nLine B', lines: ['Line A', 'Line B'] },
];

// ── computePlayRes ────────────────────────────────────────────────────────────

test('computePlayRes: half-sbs halves width', () => {
  const { playResX, playResY } = computePlayRes(cfg({ stereoscopyMode: 'half-sbs' }));
  assert.equal(playResX, 960);
  assert.equal(playResY, 1080);
});

test('computePlayRes: full-sbs keeps full size', () => {
  const { playResX, playResY } = computePlayRes(cfg({ stereoscopyMode: 'full-sbs' }));
  assert.equal(playResX, 1920);
  assert.equal(playResY, 1080);
});

test('computePlayRes: half-tab halves height', () => {
  const { playResX, playResY } = computePlayRes(cfg({ stereoscopyMode: 'half-tab' }));
  assert.equal(playResX, 1920);
  assert.equal(playResY, 540);
});

test('computePlayRes: full-tab keeps full size', () => {
  const { playResX, playResY } = computePlayRes(cfg({ stereoscopyMode: 'full-tab' }));
  assert.equal(playResX, 1920);
  assert.equal(playResY, 1080);
});

// ── buildFontString ───────────────────────────────────────────────────────────

test('buildFontString: plain', () => {
  const s = buildFontString({ fontName: 'Arial', italic: false, bold: false }, 40);
  assert.equal(s, '40px "Arial", Arial');
});

test('buildFontString: bold + italic', () => {
  const s = buildFontString({ fontName: 'Verdana', italic: true, bold: true }, 32);
  assert.equal(s, 'italic bold 32px "Verdana", Arial');
});

test('buildFontString: italic only', () => {
  const s = buildFontString({ fontName: 'Arial', italic: true, bold: false }, 20);
  assert.match(s, /^italic /);
  assert.ok(!s.includes('bold'));
});

test('buildFontString: bold only', () => {
  const s = buildFontString({ fontName: 'Arial', italic: false, bold: true }, 20);
  assert.match(s, /^bold /);
  assert.ok(!s.includes('italic'));
});

// ── computeBaselineY ─────────────────────────────────────────────────────────

test('computeBaselineY: single line sits at marginV above bottom', () => {
  // canvasH=1080, marginV=150, scaleY=1, lineHeight=60, lineCount=1
  // bottomEdge = 1080 - 150 = 930; baseY = 930 - 0*60 = 930
  const y = computeBaselineY({ marginV: 150 }, 1080, 1, 1, 60);
  assert.equal(y, 930);
});

test('computeBaselineY: two lines — first baseline is one lineHeight above the last', () => {
  // bottomEdge=930, lineCount=2, lineHeight=60 → baseY=930-(2-1)*60=870
  const y = computeBaselineY({ marginV: 150 }, 1080, 1, 2, 60);
  assert.equal(y, 870);
});

test('computeBaselineY: scales marginV by scaleY', () => {
  // marginV=150, scaleY=0.5 → marginV pixels = 75; bottomEdge = 540-75 = 465
  const y = computeBaselineY({ marginV: 150 }, 540, 0.5, 1, 50);
  assert.equal(y, 465);
});

// ── buildRenderPlan ───────────────────────────────────────────────────────────

test('buildRenderPlan: returns correct scale factors for half-sbs at 960×1080 canvas', () => {
  // canvas = playRes dimensions → scale 1:1
  const plan = buildRenderPlan(cfg(), oneCue, 960, 1080);
  assert.equal(plan.scaleX, 1);
  assert.equal(plan.scaleY, 1);
  assert.equal(plan.playResX, 960);
  assert.equal(plan.playResY, 1080);
});

test('buildRenderPlan: scale factors for smaller canvas', () => {
  // Canvas 480×540 (half of playRes 960×1080) → scale 0.5
  const plan = buildRenderPlan(cfg(), oneCue, 480, 540);
  assert.ok(Math.abs(plan.scaleX - 0.5) < 0.001);
  assert.ok(Math.abs(plan.scaleY - 0.5) < 0.001);
});

test('buildRenderPlan: no depth offset → leftX === rightX === canvasW/2', () => {
  const plan = buildRenderPlan(cfg({ depthOffset: 0 }), oneCue, 960, 1080);
  assert.equal(plan.lines[0].leftX, 480);
  assert.equal(plan.lines[0].rightX, 480);
});

test('buildRenderPlan: positive depth offset shifts eyes apart', () => {
  // depthOffset=10, scaleX=1 → halfDepth=5; leftX=475, rightX=485
  const plan = buildRenderPlan(cfg({ depthOffset: 10 }), oneCue, 960, 1080);
  assert.equal(plan.lines[0].leftX, 475);
  assert.equal(plan.lines[0].rightX, 485);
});

test('buildRenderPlan: negative depth offset crosses eyes', () => {
  // depthOffset=-10 → halfDepth=-5; leftX=485, rightX=475
  const plan = buildRenderPlan(cfg({ depthOffset: -10 }), oneCue, 960, 1080);
  assert.equal(plan.lines[0].leftX, 485);
  assert.equal(plan.lines[0].rightX, 475);
});

test('buildRenderPlan: produces one LinePlan per text line', () => {
  const plan = buildRenderPlan(cfg(), twoCue, 960, 1080);
  assert.equal(plan.lines.length, 2);
  assert.equal(plan.lines[0].text, 'Line A');
  assert.equal(plan.lines[1].text, 'Line B');
});

test('buildRenderPlan: second line y is lineHeight below first', () => {
  const plan = buildRenderPlan(cfg({ fontSize: 50 }), twoCue, 960, 1080);
  const expectedLineHeight = Math.round(50) * 1.2;
  assert.ok(Math.abs(plan.lines[1].y - plan.lines[0].y - expectedLineHeight) < 1);
});

test('buildRenderPlan: bottom line Y respects marginV', () => {
  // marginV=150, scaleY=1, single line → y = 1080-150 = 930
  const plan = buildRenderPlan(cfg({ marginV: 150 }), oneCue, 960, 1080);
  assert.equal(plan.lines[0].y, 930);
});

test('buildRenderPlan: bold flag appears in font string', () => {
  const plan = buildRenderPlan(cfg({ bold: true }), oneCue, 960, 1080);
  assert.match(plan.lines[0].font, /bold/);
});

test('buildRenderPlan: white primary color maps to rgba fill', () => {
  const plan = buildRenderPlan(cfg({ primaryColor: '#FFFFFF', primaryAlpha: 0 }), oneCue, 960, 1080);
  assert.equal(plan.lines[0].fillStyle, 'rgba(255,255,255,1)');
});

test('buildRenderPlan: outline width scales with min(scaleX, scaleY)', () => {
  // canvasW=480, canvasH=540 → scaleX=scaleY=0.5; outline=2 → outlineWidth=2*2*0.5=2
  const plan = buildRenderPlan(cfg({ outline: 2 }), oneCue, 480, 540);
  assert.ok(Math.abs(plan.lines[0].outlineWidth - 2) < 0.01);
});

test('buildRenderPlan: empty cues list → no lines', () => {
  const plan = buildRenderPlan(cfg(), [], 960, 1080);
  assert.equal(plan.lines.length, 0);
});

test('buildRenderPlan: multiple cues merged into one plan', () => {
  const cues: SrtCue[] = [
    { index: 1, startMs: 0, endMs: 1000, text: 'A', lines: ['A'] },
    { index: 2, startMs: 0, endMs: 1000, text: 'B', lines: ['B'] },
  ];
  const plan = buildRenderPlan(cfg(), cues, 960, 1080);
  assert.equal(plan.lines.length, 2);
});

// ── getActiveCues ─────────────────────────────────────────────────────────────

const timeline: SrtCue[] = [
  { index: 1, startMs: 1000, endMs: 3000, text: 'A', lines: ['A'] },
  { index: 2, startMs: 2000, endMs: 4000, text: 'B', lines: ['B'] },
  { index: 3, startMs: 5000, endMs: 6000, text: 'C', lines: ['C'] },
];

test('getActiveCues: returns cue whose window contains timeMs', () => {
  const active = getActiveCues(timeline, 1500);
  assert.equal(active.length, 1);
  assert.equal(active[0].text, 'A');
});

test('getActiveCues: overlapping cues both returned', () => {
  const active = getActiveCues(timeline, 2500);
  assert.equal(active.length, 2);
});

test('getActiveCues: startMs is inclusive', () => {
  const active = getActiveCues(timeline, 1000);
  assert.equal(active.length, 1);
  assert.equal(active[0].text, 'A');
});

test('getActiveCues: endMs is exclusive', () => {
  const active = getActiveCues(timeline, 3000);
  // cue 1 ends at 3000 (exclusive), cue 2 covers 2000–4000
  assert.equal(active.length, 1);
  assert.equal(active[0].text, 'B');
});

test('getActiveCues: returns empty between cues', () => {
  const active = getActiveCues(timeline, 4500);
  assert.equal(active.length, 0);
});
