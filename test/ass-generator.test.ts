import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAss, msToAssTime } from '../src/ass-generator.js';
import { defaultConfig, type AssConfig, type SrtCue } from '../src/types.js';

function makeConfig(overrides: Partial<AssConfig> = {}): AssConfig {
  return {
    ...defaultConfig,
    videoWidth: 1920,
    videoHeight: 1080,
    ...overrides,
  };
}

const sampleCues: SrtCue[] = [
  { index: 1, startMs: 1000, endMs: 2500, text: 'Hello', lines: ['Hello'] },
  { index: 2, startMs: 3000, endMs: 4000, text: 'Two\nlines', lines: ['Two', 'lines'] },
];

test('msToAssTime: zero', () => {
  assert.equal(msToAssTime(0), '0:00:00.00');
});

test('msToAssTime: hours, minutes, seconds, centiseconds', () => {
  assert.equal(msToAssTime(3_723_456), '1:02:03.45');
});

test('msToAssTime: clamps negative to zero', () => {
  assert.equal(msToAssTime(-100), '0:00:00.00');
});

test('generateAss: PlayRes always matches the encoded video frame', () => {
  // Anamorphic squeeze of the encoding is handled via ScaleX/Y in the style,
  // not by faking PlayRes — so all stereo modes report the full frame size.
  for (const mode of ['half-sbs', 'full-sbs', 'half-tab', 'full-tab'] as const) {
    const ass = generateAss(makeConfig({ stereoscopyMode: mode }), sampleCues);
    assert.match(ass, /PlayResX: 1920/);
    assert.match(ass, /PlayResY: 1080/);
  }
});

test('generateAss: half-sbs export pre-squeezes ScaleX to 50% of config', () => {
  // The 3D player x-stretches the cropped eye 2× at playback; pre-squeezing
  // the glyph to half-width on the encoded frame restores correct aspect.
  const ass = generateAss(makeConfig({ stereoscopyMode: 'half-sbs', scaleX: 100 }), sampleCues);
  const style = ass.split('\n').find(l => l.startsWith('Style: Default'))!;
  // Position 12 in the comma-split style line is ScaleX (after the four
  // colour tuples, four boolean flags, and font name + size).
  const fields = style.replace('Style: Default,', '').split(',');
  // Fontname, Fontsize, 4 colours, 4 flags, ScaleX, ScaleY, ...
  assert.equal(fields[10], '50');  // ScaleX = 100 * 0.5
  assert.equal(fields[11], '100'); // ScaleY unchanged
});

test('generateAss: half-tab export pre-squeezes ScaleY to 50% of config', () => {
  const ass = generateAss(makeConfig({ stereoscopyMode: 'half-tab', scaleY: 100 }), sampleCues);
  const style = ass.split('\n').find(l => l.startsWith('Style: Default'))!;
  const fields = style.replace('Style: Default,', '').split(',');
  assert.equal(fields[10], '100'); // ScaleX unchanged
  assert.equal(fields[11], '50');  // ScaleY = 100 * 0.5
});

test('generateAss: singleEye preview skips anamorphic compensation', () => {
  const ass = generateAss(
    makeConfig({ stereoscopyMode: 'half-sbs', scaleX: 100 }),
    sampleCues, false, undefined, true,
  );
  const style = ass.split('\n').find(l => l.startsWith('Style: Default'))!;
  const fields = style.replace('Style: Default,', '').split(',');
  assert.equal(fields[10], '100'); // ScaleX preserved (lavfi already unsqueezed)
});

test('generateAss: contains required script info headers', () => {
  const ass = generateAss(makeConfig(), sampleCues);
  assert.match(ass, /\[Script Info\]/);
  assert.match(ass, /ScriptType: v4\.00\+/);
  assert.match(ass, /\[V4\+ Styles\]/);
  assert.match(ass, /\[Events\]/);
});

test('generateAss: emits two dialogue lines per cue (left + right eye)', () => {
  const ass = generateAss(makeConfig(), sampleCues);
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.equal(dialogues.length, sampleCues.length * 2);
});

test('generateAss: every dialogue line is per-eye \\pos-tagged', () => {
  // Stereo subs must always emit per-eye \pos tags — otherwise both copies
  // land at the centered seam between the two eye-frames.
  const ass = generateAss(makeConfig({ stereoscopyMode: 'half-sbs' }), sampleCues);
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.match(dialogues[0], /\\pos\(/);
  assert.match(dialogues[1], /\\pos\(/);
});

test('generateAss: half-sbs positions subs at centers of the two eye-frames', () => {
  const ass = generateAss(
    makeConfig({ stereoscopyMode: 'half-sbs', depthOffset: 10, marginV: 150 }),
    [sampleCues[0]],
  );
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  // playResX=1920, playResY=1080 (full encoded frame)
  // left eye centre = playResX/4 = 480; right eye centre = 3*playResX/4 = 1440
  // depth/2 = 5 → left x = 480-5 = 475; right x = 1440+5 = 1445
  // y = 1080-150 = 930
  assert.match(dialogues[0], /\\pos\(475,930\)/);
  assert.match(dialogues[1], /\\pos\(1445,930\)/);
});

test('generateAss: singleEye half-sbs centers sub at eye centre with depth shift', () => {
  // singleEye=true models the mpv preview pipeline that crops to one eye
  // and scales back. With the cropped eye filling the visible playRes,
  // the sub sits at playResX/2 ± depth/2.
  const ass = generateAss(
    makeConfig({ stereoscopyMode: 'half-sbs', depthOffset: 10, marginV: 150 }),
    [sampleCues[0]],
    false,
    'left',
    true,
  );
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  // single dialogue line (filtered to left eye), at playResX/2 - 5 = 955
  assert.equal(dialogues.length, 1);
  assert.match(dialogues[0], /\\pos\(955,930\)/);
});

test('generateAss: half-tab positions subs at bottom of each vertical half', () => {
  const ass = generateAss(
    makeConfig({ stereoscopyMode: 'half-tab', depthOffset: 0, marginV: 150 }),
    [sampleCues[0]],
  );
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  // playResX=1920, playResY=1080 (full encoded frame)
  // half-tab encoded marginV = 150/2 = 75 (player y-stretches eye 2× at playback)
  // x same for both (centered horizontally) = 960
  // top y = 1080/2 - 75 = 465; bottom y = 1080 - 75 = 1005
  assert.match(dialogues[0], /\\pos\(960,465\)/);
  assert.match(dialogues[1], /\\pos\(960,1005\)/);
});

test('generateAss: multi-line cue uses \\N hard break', () => {
  const ass = generateAss(makeConfig(), [sampleCues[1]]);
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.match(dialogues[0], /Two\\Nlines$/);
});

test('generateAss: applies timing offset', () => {
  const ass = generateAss(makeConfig({ timingOffsetMs: 500 }), [sampleCues[0]]);
  assert.match(ass, /Dialogue: 0,0:00:01\.50,0:00:03\.00,/);
});

test('generateAss: applies speed multiplier', () => {
  const ass = generateAss(makeConfig({ timingSpeedMultiplier: 2.0 }), [sampleCues[0]]);
  // start 1000*2=2000ms => 0:00:02.00, end 2500*2=5000ms => 0:00:05.00
  assert.match(ass, /Dialogue: 0,0:00:02\.00,0:00:05\.00,/);
});

test('generateAss: clamps negative start to zero with min duration', () => {
  const ass = generateAss(makeConfig({ timingOffsetMs: -10000 }), [sampleCues[0]]);
  // both originally 1000/2500 + offset -10000 → clamped
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:00\.10,/);
});

test('generateAss: style line bold/italic flags', () => {
  const ass = generateAss(makeConfig({ bold: true, italic: true }), sampleCues);
  const styleLine = ass.split('\n').find((l) => l.startsWith('Style: Default'))!;
  // After font name + size, the next 4 colors, then -1 (bold), -1 (italic)
  assert.match(styleLine, /,-1,-1,0,0,/);
});

test('generateAss: backColor uses 75% transparency by default', () => {
  const ass = generateAss(makeConfig(), sampleCues);
  // backAlpha 0.753 → ~&HC0
  assert.match(ass, /&HC0000000/);
});
