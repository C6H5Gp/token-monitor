'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { isAuthorized, timingSafeEqualText } = require('../../src/shared/http');

test('hub secret compare uses crypto.timingSafeEqual with a length-safe pad', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/shared/http.js'), 'utf8');
  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /Buffer\.alloc\(max\)/);
  assert.doesNotMatch(source, /return requestSecret\(req\) === expectedSecret/);
});

test('timingSafeEqualText matches equal strings and rejects mismatches', () => {
  assert.equal(timingSafeEqualText('shh', 'shh'), true);
  assert.equal(timingSafeEqualText('unicode-密钥', 'unicode-密钥'), true);
  assert.equal(timingSafeEqualText('shh', 'nope'), false);
  assert.equal(timingSafeEqualText('abc', 'abd'), false);
  assert.equal(timingSafeEqualText('short', 'much-longer-secret'), false);
  assert.equal(timingSafeEqualText('much-longer-secret', 'short'), false);
  assert.equal(timingSafeEqualText('shh', 'shh '), false);
  assert.equal(timingSafeEqualText('shh', 'Shh'), false);
});

test('timingSafeEqualText treats empty and missing values as empty strings', () => {
  assert.equal(timingSafeEqualText('', ''), true);
  assert.equal(timingSafeEqualText('', 'shh'), false);
  assert.equal(timingSafeEqualText('shh', ''), false);
  assert.equal(timingSafeEqualText(undefined, undefined), true);
  assert.equal(timingSafeEqualText(null, null), true);
  assert.equal(timingSafeEqualText(undefined, ''), true);
  assert.equal(timingSafeEqualText(null, ''), true);
  assert.equal(timingSafeEqualText(undefined, 'shh'), false);
  assert.equal(timingSafeEqualText(null, 'shh'), false);
});

test('timingSafeEqualText stringifies non-string inputs instead of throwing', () => {
  assert.doesNotThrow(() => timingSafeEqualText(12, '12'));
  assert.equal(timingSafeEqualText(12, '12'), true);
  assert.equal(timingSafeEqualText(12, 12), true);
  assert.equal(timingSafeEqualText(12, 13), false);
  assert.equal(timingSafeEqualText(true, 'true'), true);
  assert.equal(timingSafeEqualText({}, {}), true);
  assert.equal(timingSafeEqualText({ a: 1 }, 'shh'), false);
  // Array#toString joins elements, so ['shh'] stringifies to 'shh'.
  assert.equal(timingSafeEqualText(['shh'], 'shh'), true);
  assert.equal(timingSafeEqualText(['nope'], 'shh'), false);
});

test('isAuthorized allows any caller when no hub secret is configured', () => {
  assert.equal(isAuthorized({ headers: {} }, ''), true);
  assert.equal(isAuthorized({ headers: {} }, undefined), true);
  assert.equal(isAuthorized({ headers: {} }, null), true);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer nope' } }, ''), true);
});

test('isAuthorized accepts Bearer with scheme case and surrounding whitespace', () => {
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'bearer shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'BEARER shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'BeArEr shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer  shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer shh  ' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer\tshh' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { authorization: 'Basic shh' } }, 'shh'), false);
});

test('isAuthorized accepts x-token-monitor-secret and trims it', () => {
  assert.equal(isAuthorized({ headers: { 'x-token-monitor-secret': 'shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { 'x-token-monitor-secret': '  shh  ' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { 'x-token-monitor-secret': 'nope' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { 'x-token-monitor-secret': '' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { 'x-token-monitor-secret': '   ' } }, 'shh'), false);
});

test('isAuthorized prefers Authorization over the custom secret header', () => {
  assert.equal(isAuthorized({
    headers: { authorization: 'Bearer shh', 'x-token-monitor-secret': 'nope' }
  }, 'shh'), true);
  assert.equal(isAuthorized({
    headers: { authorization: 'Bearer nope', 'x-token-monitor-secret': 'shh' }
  }, 'shh'), false);
  assert.equal(isAuthorized({
    headers: { authorization: 'Bearer ', 'x-token-monitor-secret': 'shh' }
  }, 'shh'), false);
});

test('isAuthorized rejects a missing, wrong, or length-mismatched secret', () => {
  assert.equal(isAuthorized({ headers: {} }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer nope' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer sh' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer shhh' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer SHH' } }, 'shh'), false);
});

test('isAuthorized ignores a query-shaped URL; Node hub is header-only', () => {
  assert.equal(isAuthorized({
    headers: {},
    url: '/api/stats?secret=shh'
  }, 'shh'), false);
  assert.equal(isAuthorized({
    headers: { authorization: 'Bearer nope' },
    url: '/api/ingest?secret=shh'
  }, 'shh'), false);
  assert.equal(isAuthorized({
    headers: { 'x-token-monitor-secret': '' },
    url: '/api/devices?secret=shh'
  }, 'shh'), false);
});
