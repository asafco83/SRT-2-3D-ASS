import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDar, parseFps, inferSbsType, parseProbeJson, parseTracksJson, extractMetadata } from '../src/ffprobe.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'test', 'fixtures');

// ── parseDar ──────────────────────────────────────────────────────────────────

test('parseDar: 16:9', () => {
  assert.ok(Math.abs(parseDar('16:9') - 1.7778) < 0.001);
});

test('parseDar: 32:9', () => {
  assert.ok(Math.abs(parseDar('32:9') - 3.5556) < 0.001);
});

test('parseDar: invalid returns NaN', () => {
  assert.ok(isNaN(parseDar('bad')));
  assert.ok(isNaN(parseDar('16:0')));
});

// ── parseFps ─────────────────────────────────────────────────────────────────

test('parseFps: 24000/1001 ≈ 23.976', () => {
  assert.ok(Math.abs(parseFps('24000/1001') - 23.976) < 0.001);
});

test('parseFps: 25/1 = 25', () => {
  assert.equal(parseFps('25/1'), 25);
});

test('parseFps: bad string returns 0', () => {
  assert.equal(parseFps(''), 0);
  assert.equal(parseFps('0/0'), 0);
});

// ── inferSbsType ─────────────────────────────────────────────────────────────

test('inferSbsType: 1920x1080 DAR 16:9 → half-sbs', () => {
  assert.equal(inferSbsType(1920, 1080, '16:9'), 'half-sbs');
});

test('inferSbsType: 3840x1080 → full-sbs (any DAR)', () => {
  // double-wide aspect → full-SBS regardless of encoder DAR tagging
  assert.equal(inferSbsType(3840, 1080, '16:9'), 'full-sbs');
  assert.equal(inferSbsType(3840, 1080, '32:9'), 'full-sbs');
});

test('inferSbsType: 3832x1080 DAR 479:135 → full-sbs', () => {
  // real-world case: encoder dropped 8px to keep some constraint, still
  // clearly double-wide
  assert.equal(inferSbsType(3832, 1080, '479:135'), 'full-sbs');
});

test('inferSbsType: 1280x720 → half-sbs', () => {
  assert.equal(inferSbsType(1280, 720, '16:9'), 'half-sbs');
});

test('inferSbsType: 1920x1080 with no DAR still detects from dimensions', () => {
  assert.equal(inferSbsType(1920, 1080, 'N/A'), 'half-sbs');
});

test('inferSbsType: 4:3 / square / zero → unknown', () => {
  assert.equal(inferSbsType(640, 480, 'N/A'), 'unknown');
  assert.equal(inferSbsType(0, 0, 'N/A'), 'unknown');
});

// ── parseProbeJson ────────────────────────────────────────────────────────────

test('parseProbeJson: half-sbs fixture', () => {
  const json = readFileSync(join(fixtures, 'ffprobe-half-sbs.json'), 'utf8');
  const meta = parseProbeJson(json);
  assert.equal(meta.width, 1920);
  assert.equal(meta.height, 1080);
  assert.equal(meta.codec, 'hevc');
  assert.ok(Math.abs(meta.fps - 23.976) < 0.001);
  assert.equal(meta.detectedSbsType, 'half-sbs');
  assert.equal(meta.eyeOrder, 'left-first');
  assert.equal(meta.stereoMode, '1');
});

test('parseProbeJson: full-sbs fixture with stereo_mode 11 → right-first', () => {
  const json = readFileSync(join(fixtures, 'ffprobe-full-sbs.json'), 'utf8');
  const meta = parseProbeJson(json);
  assert.equal(meta.width, 3840);
  assert.equal(meta.codec, 'h264');
  assert.equal(meta.fps, 25);
  assert.equal(meta.detectedSbsType, 'full-sbs');
  assert.equal(meta.eyeOrder, 'right-first');
  assert.equal(meta.stereoMode, '11');
});

test('parseProbeJson: missing video stream throws', () => {
  assert.throws(() => parseProbeJson('{"streams":[{"codec_type":"audio"}],"format":{}}'));
});

test('parseProbeJson: missing tags → stereoMode undefined, eyeOrder left-first', () => {
  const json = JSON.stringify({
    streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080,
                 display_aspect_ratio: '16:9', avg_frame_rate: '25/1' }],
    format: {},
  });
  const meta = parseProbeJson(json);
  assert.equal(meta.stereoMode, undefined);
  assert.equal(meta.eyeOrder, 'left-first');
});

// ── integration ───────────────────────────────────────────────────────────────

const subdir = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const ext = process.platform === 'win32' ? '.exe' : '';
const ffprobeBin = join(here, '..', '..', 'bin', subdir, `ffprobe${ext}`);
const sampleMkv = join(fixtures, 'sample.mkv');
const binsPresent = existsSync(ffprobeBin) && existsSync(sampleMkv);

test('extractMetadata: returns correct dimensions and codec for sample.mkv',
  { skip: !binsPresent },
  async () => {
    const meta = await extractMetadata(sampleMkv, ffprobeBin);
    assert.equal(meta.width, 1920);
    assert.equal(meta.height, 1080);
    assert.equal(meta.codec, 'h264');
    assert.equal(meta.fps, 25);
    assert.equal(meta.dar, '16:9');
    assert.equal(meta.detectedSbsType, 'half-sbs');
    assert.equal(meta.eyeOrder, 'left-first');
  },
);

test('extractMetadata: throws on non-existent file',
  { skip: !existsSync(ffprobeBin) },
  async () => {
    await assert.rejects(
      () => extractMetadata('/no/such/file.mkv', ffprobeBin),
      /ffprobe exited/,
    );
  },
);

// ── parseTracksJson ───────────────────────────────────────────────────────────

const TRACKS_JSON = JSON.stringify({
  streams: [
    {
      index: 0, codec_type: 'video', codec_name: 'h264',
      width: 1920, height: 1080,
      tags: { language: 'und' },
      disposition: { default: 1, forced: 0 },
    },
    {
      index: 1, codec_type: 'audio', codec_name: 'dts',
      channels: 6,
      tags: { language: 'eng', title: 'DTS-HD MA 5.1' },
      disposition: { default: 1, forced: 0 },
    },
    {
      index: 2, codec_type: 'audio', codec_name: 'aac',
      channels: 2,
      tags: { language: 'eng' },
      disposition: { default: 0, forced: 0 },
    },
    {
      index: 3, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle',
      tags: { language: 'eng', title: 'English' },
      disposition: { default: 0, forced: 0 },
    },
  ],
});

test('parseTracksJson: returns correct track count', () => {
  const tracks = parseTracksJson(TRACKS_JSON);
  assert.equal(tracks.length, 4);
});

test('parseTracksJson: video track has correct fields', () => {
  const tracks = parseTracksJson(TRACKS_JSON);
  const v = tracks[0];
  assert.equal(v.type, 'video');
  assert.equal(v.codec, 'h264');
  assert.equal(v.width, 1920);
  assert.equal(v.height, 1080);
  assert.equal(v.isDefault, true);
});

test('parseTracksJson: audio track has channels and title', () => {
  const tracks = parseTracksJson(TRACKS_JSON);
  const a = tracks[1];
  assert.equal(a.type, 'audio');
  assert.equal(a.channels, 6);
  assert.equal(a.language, 'eng');
  assert.equal(a.title, 'DTS-HD MA 5.1');
});

test('parseTracksJson: subtitle track type', () => {
  const tracks = parseTracksJson(TRACKS_JSON);
  assert.equal(tracks[3].type, 'subtitle');
  assert.equal(tracks[3].codec, 'hdmv_pgs_subtitle');
});

test('parseTracksJson: handles empty streams', () => {
  const tracks = parseTracksJson('{"streams":[]}');
  assert.deepEqual(tracks, []);
});

test('parseTracksJson: unknown codec_type maps to other', () => {
  const json = JSON.stringify({ streams: [{ index: 0, codec_type: 'data', codec_name: 'bin_data', disposition: {} }] });
  const tracks = parseTracksJson(json);
  assert.equal(tracks[0].type, 'other');
});
