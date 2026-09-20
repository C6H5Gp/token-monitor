'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { isAuthorized, timingSafeEqualText } = require('../../src/shared/http');

test('hub secret compare uses crypto.timingSafeEqual with a length-safe pad', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/shared/http.js'), 'utf8');
  assert.match(source, /crypto\.timingSafeEqual/);
  assert.doesNotMatch(source, /return requestSecret\(req\) === expectedSecret/);
});

test('timingSafeEqualText matches equal strings and rejects mismatches', () => {
  assert.equal(timingSafeEqualText('shh', 'shh'), true);
  assert.equal(timingSafeEqualText('shh', 'nope'), false);
  assert.equal(timingSafeEqualText('short', 'much-longer-secret'), false);
  assert.equal(timingSafeEqualText('much-longer-secret', 'short'), false);
  assert.equal(timingSafeEqualText('', 'shh'), false);
  assert.equal(timingSafeEqualText('', ''), true);
});

test('isAuthorized prefers Bearer then x-token-monitor-secret and ignores query', () => {
  assert.equal(isAuthorized({ headers: {} }, ''), true);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'bearer shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { authorization: 'Bearer nope' } }, 'shh'), false);
  assert.equal(isAuthorized({ headers: { 'x-token-monitor-secret': 'shh' } }, 'shh'), true);
  assert.equal(isAuthorized({ headers: { 'x-token-monitor-secret': 'nope' } }, 'shh'), false);
  assert.equal(isAuthorized({
    headers: { authorization: 'Bearer shh', 'x-token-monitor-secret': 'nope' }
  }, 'shh'), true);
  // Node hub is header-only: a query-shaped URL is not a secret source.
  assert.equal(isAuthorized({
    headers: {},
    url: '/api/stats?secret=shh'
  }, 'shh'), false);
});
