import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMuxArgs, getSafeOutputPath, muxToMkv } from '../src/mkvmerge.js';

function baseOpts(overrides: Partial<Parameters<typeof buildMuxArgs>[0]> = {}) {
  return {
    mkvmergeBin: 'mkvmerge',
    videoPath: '/src/movie.mkv',
    assPath: '/src/movie.3D.HalfSBS.ass',
    outputPath: '/out/movie.3D.HalfSBS.mkv',
    language: 'eng',
    trackName: 'English 3D SBS',
    isDefault: false,
    isForced: false,
    includeTracks: { audio: [1], subtitles: [] },
    ...overrides,
  };
}

// ── getSafeOutputPath ─────────────────────────────────────────────────────────

test('getSafeOutputPath: returns desired path when file does not exist', () => {
  const p = join(tmpdir(), `srt3d-safe-${Date.now()}-nonexistent.mkv`);
  assert.equal(getSafeOutputPath(p), p);
});

test('getSafeOutputPath: appends _2 when file exists', () => {
  const p = join(tmpdir(), `srt3d-safe-${Date.now()}.mkv`);
  writeFileSync(p, '');
  try {
    const safe = getSafeOutputPath(p);
    assert.match(safe, /_2\.mkv$/);
    assert.notEqual(safe, p);
  } finally {
    unlinkSync(p);
  }
});

test('getSafeOutputPath: increments past _2 when _2 also exists', () => {
  const base = join(tmpdir(), `srt3d-safe-${Date.now()}`);
  const p1 = `${base}.mkv`;
  const p2 = `${base}_2.mkv`;
  writeFileSync(p1, '');
  writeFileSync(p2, '');
  try {
    const safe = getSafeOutputPath(p1);
    assert.match(safe, /_3\.mkv$/);
  } finally {
    unlinkSync(p1);
    unlinkSync(p2);
  }
});

// ── buildMuxArgs ──────────────────────────────────────────────────────────────

test('buildMuxArgs: output path is first positional arg after --output', () => {
  const args = buildMuxArgs(baseOpts(), '/out/final.mkv');
  assert.equal(args[0], '--output');
  assert.equal(args[1], '/out/final.mkv');
});

test('buildMuxArgs: includes specified audio tracks', () => {
  const args = buildMuxArgs(baseOpts({ includeTracks: { audio: [1, 2], subtitles: [] } }), '/o.mkv');
  const idx = args.indexOf('--audio-tracks');
  assert.ok(idx !== -1);
  assert.equal(args[idx + 1], '1,2');
});

test('buildMuxArgs: --no-audio when audio list empty', () => {
  const args = buildMuxArgs(baseOpts({ includeTracks: { audio: [], subtitles: [] } }), '/o.mkv');
  assert.ok(args.includes('--no-audio'));
  assert.ok(!args.includes('--audio-tracks'));
});

test('buildMuxArgs: --no-subtitles when subtitle list empty', () => {
  const args = buildMuxArgs(baseOpts({ includeTracks: { audio: [1], subtitles: [] } }), '/o.mkv');
  assert.ok(args.includes('--no-subtitles'));
});

test('buildMuxArgs: includes subtitle tracks when specified', () => {
  const args = buildMuxArgs(baseOpts({ includeTracks: { audio: [1], subtitles: [2] } }), '/o.mkv');
  const idx = args.indexOf('--subtitle-tracks');
  assert.ok(idx !== -1);
  assert.equal(args[idx + 1], '2');
});

test('buildMuxArgs: source video file appears before ASS file', () => {
  const opts = baseOpts();
  const args = buildMuxArgs(opts, '/o.mkv');
  const vidIdx = args.indexOf(opts.videoPath);
  const assIdx = args.indexOf(opts.assPath);
  assert.ok(vidIdx !== -1 && assIdx !== -1);
  assert.ok(vidIdx < assIdx, 'source video must appear before ASS track');
});

test('buildMuxArgs: language and track-name for ASS track', () => {
  const args = buildMuxArgs(baseOpts({ language: 'heb', trackName: 'Hebrew 3D' }), '/o.mkv');
  const langIdx = args.indexOf('--language');
  assert.ok(langIdx !== -1);
  assert.equal(args[langIdx + 1], '0:heb');
  const nameIdx = args.indexOf('--track-name');
  assert.equal(args[nameIdx + 1], '0:Hebrew 3D');
});

test('buildMuxArgs: default-track yes/no', () => {
  const argsYes = buildMuxArgs(baseOpts({ isDefault: true }), '/o.mkv');
  const argsNo = buildMuxArgs(baseOpts({ isDefault: false }), '/o.mkv');
  const yIdx = argsYes.indexOf('--default-track');
  const nIdx = argsNo.indexOf('--default-track');
  assert.equal(argsYes[yIdx + 1], '0:yes');
  assert.equal(argsNo[nIdx + 1], '0:no');
});

test('buildMuxArgs: forced-track yes/no', () => {
  const argsYes = buildMuxArgs(baseOpts({ isForced: true }), '/o.mkv');
  assert.ok(argsYes.includes('0:yes'));
});

test('buildMuxArgs: trackNameOverrides emit --track-name before source video', () => {
  const args = buildMuxArgs(baseOpts({
    trackNameOverrides: { 1: 'Director Commentary', 2: 'Hebrew' },
  }), '/o.mkv');
  const videoIdx = args.indexOf('/src/movie.mkv');
  assert.ok(videoIdx !== -1);
  // Both override args must appear before the video file path.
  const t1 = args.findIndex((a, i) => a === '--track-name' && args[i + 1] === '1:Director Commentary');
  const t2 = args.findIndex((a, i) => a === '--track-name' && args[i + 1] === '2:Hebrew');
  assert.ok(t1 !== -1 && t1 < videoIdx);
  assert.ok(t2 !== -1 && t2 < videoIdx);
});

test('buildMuxArgs: empty / whitespace overrides are skipped', () => {
  const args = buildMuxArgs(baseOpts({
    trackNameOverrides: { 1: '', 2: '   ', 3: 'Real' },
  }), '/o.mkv');
  assert.ok(!args.some((a, i) => a === '--track-name' && /^[12]:/.test(args[i + 1] ?? '')));
  assert.ok(args.some((a, i) => a === '--track-name' && args[i + 1] === '3:Real'));
});

// ── integration: real mkvmerge (skipped unless binary found) ─────────────────

const MKVMERGE_PATH = (() => {
  const candidates = [
    'C:\\Program Files\\MKVToolNix\\mkvmerge.exe',
    '/usr/bin/mkvmerge',
    '/usr/local/bin/mkvmerge',
  ];
  return candidates.find(existsSync) ?? null;
})();

test('muxToMkv: integration with real mkvmerge', { skip: MKVMERGE_PATH === null }, async () => {
  const dir = tmpdir();
  const fakeAss = join(dir, `srt3d-mux-test-${Date.now()}.ass`);
  const fakeMkv = join(dir, `srt3d-mux-test-${Date.now()}.mkv`);
  const outMkv = join(dir, `srt3d-mux-out-${Date.now()}.mkv`);

  // mkvmerge needs a real MKV source; without one it will error with code 2.
  // We only verify that the code path runs and getSafeOutputPath is called.
  // A real end-to-end test requires a fixture video.
  writeFileSync(fakeAss, '[Script Info]\n');
  try {
    await assert.rejects(
      () => muxToMkv({
        mkvmergeBin: MKVMERGE_PATH!,
        videoPath: fakeMkv,   // doesn't exist → mkvmerge exits 2
        assPath: fakeAss,
        outputPath: outMkv,
        language: 'eng',
        trackName: 'Test',
        isDefault: false,
        isForced: false,
        includeTracks: { audio: [], subtitles: [] },
      }),
      /mkvmerge failed/,
    );
  } finally {
    unlinkSync(fakeAss);
    if (existsSync(outMkv)) unlinkSync(outMkv);
  }
});
