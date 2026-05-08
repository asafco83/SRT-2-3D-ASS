import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMpvCommand, parseMpvMessage } from '../src/mpv-protocol.js';

// ── buildMpvCommand ───────────────────────────────────────────────────────────

test('buildMpvCommand: produces valid JSON with command and request_id', () => {
  const line = buildMpvCommand(['seek', 5.0, 'absolute'], 1);
  const obj = JSON.parse(line.trim());
  assert.deepEqual(obj.command, ['seek', 5.0, 'absolute']);
  assert.equal(obj.request_id, 1);
});

test('buildMpvCommand: ends with newline', () => {
  assert.ok(buildMpvCommand(['pause'], 2).endsWith('\n'));
});

test('buildMpvCommand: set_property packs args correctly', () => {
  const line = buildMpvCommand(['set_property', 'pause', false], 3);
  const obj = JSON.parse(line.trim());
  assert.equal(obj.command[0], 'set_property');
  assert.equal(obj.command[1], 'pause');
  assert.equal(obj.command[2], false);
});

// ── parseMpvMessage ───────────────────────────────────────────────────────────

test('parseMpvMessage: parses a success response', () => {
  const msg = parseMpvMessage('{"request_id":1,"error":"success","data":5.25}');
  assert.ok(msg !== null);
  assert.equal(msg!.type, 'response');
  if (msg!.type === 'response') {
    assert.equal(msg.requestId, 1);
    assert.equal(msg.error, 'success');
    assert.equal(msg.data, 5.25);
  }
});

test('parseMpvMessage: parses a null-data response', () => {
  const msg = parseMpvMessage('{"request_id":2,"error":"success","data":null}');
  assert.ok(msg !== null && msg.type === 'response');
  if (msg?.type === 'response') assert.equal(msg.data, null);
});

test('parseMpvMessage: parses an event', () => {
  const msg = parseMpvMessage('{"event":"time-pos","data":10.0}');
  assert.ok(msg !== null);
  assert.equal(msg!.type, 'event');
  if (msg!.type === 'event') assert.equal(msg.event, 'time-pos');
});

test('parseMpvMessage: returns null for empty/invalid JSON', () => {
  assert.equal(parseMpvMessage(''), null);
  assert.equal(parseMpvMessage('{bad json'), null);
  assert.equal(parseMpvMessage('   '), null);
});

test('parseMpvMessage: returns null for JSON without event or request_id', () => {
  assert.equal(parseMpvMessage('{"foo":"bar"}'), null);
});

test('parseMpvMessage: handles whitespace-padded lines', () => {
  const msg = parseMpvMessage('  {"request_id":5,"error":"success","data":0}  \n');
  assert.ok(msg !== null && msg.type === 'response');
});

test('parseMpvMessage: error field preserved on failure response', () => {
  const msg = parseMpvMessage('{"request_id":3,"error":"property unavailable","data":null}');
  assert.ok(msg !== null && msg.type === 'response');
  if (msg?.type === 'response') assert.equal(msg.error, 'property unavailable');
});
