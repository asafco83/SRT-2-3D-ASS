import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { getFilenameSuffix, buildDefaultOutputPath, buildAssContent, exportAss } from '../src/exporter.js';
import { defaultConfig, type AssConfig, type SrtCue } from '../src/types.js';

function makeConfig(overrides: Partial<AssConfig> = {}): AssConfig {
  return { ...defaultConfig, videoWidth: 1920, videoHeight: 1080, ...overrides };
}

const sampleCues: SrtCue[] = [
  { index: 1, startMs: 1000, endMs: 2000, text: 'Hi', lines: ['Hi'] },
];

// ── getFilenameSuffix ─────────────────────────────────────────────────────────

test('getFilenameSuffix: all modes', () => {
  assert.equal(getFilenameSuffix('half-sbs'), '3D.HalfSBS');
  assert.equal(getFilenameSuffix('full-sbs'), '3D.SBS');
  assert.equal(getFilenameSuffix('half-tab'), '3D.HalfOU');
  assert.equal(getFilenameSuffix('full-tab'), '3D.OU');
});

// ── buildDefaultOutputPath ────────────────────────────────────────────────────

test('buildDefaultOutputPath: replaces video extension with .ass', () => {
  const p = buildDefaultOutputPath(join(tmpdir(), 'Avatar.mkv'), { stereoscopyMode: 'half-sbs' });
  assert.match(p, /Avatar\.3D\.HalfSBS\.ass$/);
});

test('buildDefaultOutputPath: stays in same directory as video', () => {
  const videoPath = join(tmpdir(), 'movies', 'Avatar.mkv');
  const p = buildDefaultOutputPath(videoPath, { stereoscopyMode: 'half-sbs' });
  assert.equal(dirname(p), dirname(videoPath));
});

test('buildDefaultOutputPath: full-sbs suffix', () => {
  const p = buildDefaultOutputPath(join(tmpdir(), 'movie.mp4'), { stereoscopyMode: 'full-sbs' });
  assert.match(p, /movie\.3D\.SBS\.ass$/);
});

// ── buildAssContent ───────────────────────────────────────────────────────────

test('buildAssContent: utf-8-bom prepends BOM character', () => {
  const content = buildAssContent(makeConfig({ encoding: 'utf-8-bom' }), sampleCues);
  assert.equal(content.codePointAt(0), 0xfeff);
});

test('buildAssContent: utf-8 has no BOM', () => {
  const content = buildAssContent(makeConfig({ encoding: 'utf-8' }), sampleCues);
  assert.notEqual(content.codePointAt(0), 0xfeff);
  assert.match(content, /\[Script Info\]/);
});

test('buildAssContent: contains dialogue lines', () => {
  const content = buildAssContent(makeConfig(), sampleCues);
  assert.match(content, /Dialogue:/);
});

// ── exportAss (writes to temp file) ──────────────────────────────────────────

test('exportAss: writes readable file with correct content', async () => {
  const outPath = join(tmpdir(), `srt3d-test-export-${Date.now()}.ass`);
  try {
    await exportAss(outPath, makeConfig({ encoding: 'utf-8-bom' }), sampleCues);
    const buf = await readFile(outPath);
    // First three bytes = UTF-8 BOM EF BB BF
    assert.equal(buf[0], 0xef);
    assert.equal(buf[1], 0xbb);
    assert.equal(buf[2], 0xbf);
    const text = buf.toString('utf8');
    assert.match(text, /\[Script Info\]/);
    assert.match(text, /PlayResX: 1920/);
    assert.match(text, /Dialogue:/);
  } finally {
    await unlink(outPath).catch(() => {});
  }
});
