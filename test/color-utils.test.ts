import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToAssColor, hexToRgba } from '../src/color-utils.js';

test('htmlToAssColor: white opaque', () => {
  assert.equal(htmlToAssColor('#FFFFFF', 0), '&H00FFFFFF');
});

test('htmlToAssColor: black opaque', () => {
  assert.equal(htmlToAssColor('#000000', 0), '&H00000000');
});

test('htmlToAssColor: red has reversed byte order (BBGGRR)', () => {
  assert.equal(htmlToAssColor('#FF0000', 0), '&H000000FF');
});

test('htmlToAssColor: blue maps to BB position', () => {
  assert.equal(htmlToAssColor('#0000FF', 0), '&H00FF0000');
});

test('htmlToAssColor: 75% transparent black shadow', () => {
  assert.equal(htmlToAssColor('#000000', 0.753), '&HC0000000');
});

test('htmlToAssColor: accepts hex without #', () => {
  assert.equal(htmlToAssColor('FFFFFF', 0), '&H00FFFFFF');
});

test('htmlToAssColor: clamps alpha', () => {
  assert.equal(htmlToAssColor('#FFFFFF', 1), '&HFFFFFFFF');
  assert.equal(htmlToAssColor('#FFFFFF', 2), '&HFFFFFFFF');
});

test('htmlToAssColor: rejects invalid hex', () => {
  assert.throws(() => htmlToAssColor('#FFF'));
});

test('hexToRgba', () => {
  assert.equal(hexToRgba('#FF8040', 0.5), 'rgba(255,128,64,0.5)');
});
