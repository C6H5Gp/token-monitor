'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

function fakeState() {
  const map = new Map();
  return {
    storage: {
      async get(key) { return map.get(key); },
      async put(key, value) { map.set(key, JSON.parse(JSON.stringify(value))); },
      async delete(key) { map.delete(key); },
      async list({ prefix } = {}) {
        const out = new Map();
        for (const [key, value] of map) {
          if (!prefix || key.startsWith(prefix)) out.set(key, value);
        }
        return out;
      }
    }
  };
}

async function hubDO(env = { TOKEN_MONITOR_SECRET: 'shh' }) {
  const worker = await import(pathToFileURL(path.resolve(__dirname, '../../worker/src/index.js')).href);
  return new worker.HubDO(fakeState(), env);
}

test('Worker prefers header auth and keeps query secret as a compatibility path', async () => {
  const hub = await hubDO();

  assert.equal((await hub.fetch(new Request('https://hub.example/api/stats'))).status, 401);

  const bearer = await hub.fetch(new Request('https://hub.example/api/stats', {
    headers: { authorization: 'Bearer shh' }
  }));
  assert.equal(bearer.status, 200);

  const header = await hub.fetch(new Request('https://hub.example/api/stats', {
    headers: { 'x-token-monitor-secret': 'shh' }
  }));
  assert.equal(header.status, 200);

  const query = await hub.fetch(new Request('https://hub.example/api/stats?secret=shh'));
  assert.equal(query.status, 200);

  const wrongQuery = await hub.fetch(new Request('https://hub.example/api/stats?secret=nope'));
  assert.equal(wrongQuery.status, 401);

  const wrongLength = await hub.fetch(new Request('https://hub.example/api/stats', {
    headers: { authorization: 'Bearer sh' }
  }));
  assert.equal(wrongLength.status, 401);

  // A present Authorization header wins even when the query still carries the secret.
  const headerWins = await hub.fetch(new Request('https://hub.example/api/stats?secret=shh', {
    headers: { authorization: 'Bearer nope' }
  }));
  assert.equal(headerWins.status, 401);
});
