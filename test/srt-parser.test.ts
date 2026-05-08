import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt } from '../src/srt-parser.js';

test('parses basic single cue', () => {
  const cues = parseSrt('1\n00:00:01,000 --> 00:00:02,500\nHello\n');
  assert.equal(cues.length, 1);
  assert.equal(cues[0].index, 1);
  assert.equal(cues[0].startMs, 1000);
  assert.equal(cues[0].endMs, 2500);
  assert.deepEqual(cues[0].lines, ['Hello']);
});

test('parses multiple cues separated by blank lines', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n';
  const cues = parseSrt(srt);
  assert.equal(cues.length, 2);
  assert.equal(cues[1].startMs, 3000);
});

test('handles CRLF line endings', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\nWorld\r\n';
  const cues = parseSrt(srt);
  assert.equal(cues.length, 1);
  assert.deepEqual(cues[0].lines, ['Hello', 'World']);
});

test('strips UTF-8 BOM', () => {
  const srt = '﻿1\n00:00:01,000 --> 00:00:02,000\nHello\n';
  const cues = parseSrt(srt);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].index, 1);
});

test('converts <b>, <i>, <u> to ASS override tags', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n<b>bold</b> <i>it</i> <u>u</u>\n';
  const cues = parseSrt(srt);
  assert.equal(cues[0].lines[0], '{\\b1}bold{\\b0} {\\i1}it{\\i0} {\\u1}u{\\u0}');
});

test('strips <font> tags', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n<font color="#FF0000">red</font>\n';
  const cues = parseSrt(srt);
  assert.equal(cues[0].lines[0], 'red');
});

test('handles dot timecode separator', () => {
  const srt = '1\n00:00:01.500 --> 00:00:02.250\nHello\n';
  const cues = parseSrt(srt);
  assert.equal(cues[0].startMs, 1500);
  assert.equal(cues[0].endMs, 2250);
});

test('hour-spanning timecode', () => {
  const srt = '1\n01:02:03,456 --> 01:02:04,000\nHi\n';
  const cues = parseSrt(srt);
  assert.equal(cues[0].startMs, 3723456);
});

test('handles missing index line', () => {
  const srt = '00:00:01,000 --> 00:00:02,000\nHello\n';
  const cues = parseSrt(srt);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].index, 1);
});
