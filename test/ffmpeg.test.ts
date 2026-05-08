import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { buildGrabArgs, grabFrame } from '../src/ffmpeg.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'test', 'fixtures');
const subdir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const ext = process.platform === 'win32' ? '.exe' : '';
const ffmpegBin = join(here, '..', '..', 'bin', subdir, `ffmpeg${ext}`);
const sampleMkv = join(fixtures, 'sample.mkv');
const binsPresent = existsSync(ffmpegBin) && existsSync(sampleMkv);

// ── buildGrabArgs (pure logic, no binary needed) ──────────────────────────────

test('buildGrabArgs: seeks before input for fast seeking', () => {
  const args = buildGrabArgs(
    { videoPath: '/vid.mkv', timeMs: 5000, ffmpegBin: 'ffmpeg' },
    '/out.jpg',
  );
  // -ss must appear before -i
  const ssIdx = args.indexOf('-ss');
  const iIdx = args.indexOf('-i');
  assert.ok(ssIdx !== -1 && iIdx !== -1);
  assert.ok(ssIdx < iIdx, '-ss must come before -i');
});

test('buildGrabArgs: time is in seconds', () => {
  const args = buildGrabArgs(
    { videoPath: '/v.mkv', timeMs: 2500, ffmpegBin: 'ffmpeg' },
    '/out.jpg',
  );
  const ssIdx = args.indexOf('-ss');
  assert.equal(args[ssIdx + 1], '2.5');
});

test('buildGrabArgs: extracts single frame', () => {
  const args = buildGrabArgs(
    { videoPath: '/v.mkv', timeMs: 1000, ffmpegBin: 'ffmpeg' },
    '/out.jpg',
  );
  const framesIdx = args.indexOf('-frames:v');
  assert.ok(framesIdx !== -1);
  assert.equal(args[framesIdx + 1], '1');
});

test('buildGrabArgs: default quality is 3', () => {
  const args = buildGrabArgs(
    { videoPath: '/v.mkv', timeMs: 0, ffmpegBin: 'ffmpeg' },
    '/out.jpg',
  );
  const qIdx = args.indexOf('-q:v');
  assert.equal(args[qIdx + 1], '3');
});

test('buildGrabArgs: custom quality is used', () => {
  const args = buildGrabArgs(
    { videoPath: '/v.mkv', timeMs: 0, ffmpegBin: 'ffmpeg', quality: 5 },
    '/out.jpg',
  );
  const qIdx = args.indexOf('-q:v');
  assert.equal(args[qIdx + 1], '5');
});

test('buildGrabArgs: output path is last arg and -y precedes it', () => {
  const out = join(tmpdir(), 'test.jpg');
  const args = buildGrabArgs(
    { videoPath: '/v.mkv', timeMs: 0, ffmpegBin: 'ffmpeg' },
    out,
  );
  assert.equal(args.at(-1), out);
  assert.equal(args.at(-2), '-y'); // -y overwrite flag just before output
});

// ── integration ───────────────────────────────────────────────────────────────

test('grabFrame: produces a JPEG file for frame at 500ms',
  { skip: !binsPresent },
  async () => {
    const outPath = await grabFrame({ videoPath: sampleMkv, timeMs: 500, ffmpegBin });
    try {
      assert.ok(existsSync(outPath), 'output file must exist');
      const stat = statSync(outPath);
      assert.ok(stat.size > 1000, 'JPEG should be larger than 1 KB');
      // Verify JPEG magic bytes FF D8 FF
      const { readFileSync } = await import('node:fs');
      const buf = readFileSync(outPath);
      assert.equal(buf[0], 0xff);
      assert.equal(buf[1], 0xd8);
      assert.equal(buf[2], 0xff);
    } finally {
      unlinkSync(outPath);
    }
  },
);

test('grabFrame: throws on non-existent file',
  { skip: !existsSync(ffmpegBin) },
  async () => {
    await assert.rejects(
      () => grabFrame({ videoPath: '/no/such/file.mkv', timeMs: 0, ffmpegBin }),
      /ffmpeg exited/,
    );
  },
);
