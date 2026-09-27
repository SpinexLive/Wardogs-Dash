const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function client(fetch, key = 'test-key') {
  const context = { module: { exports: {} }, require: (name) => name === './statsSnapshot' ? { read: () => ({ players: {} }) } : ({ WARDOGS_API_KEY: key }), fetch, AbortSignal, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/lib/wardogs.js'), 'utf8'), context);
  return context.module.exports;
}
const id = '76561198000000001';
const reply = (body, status = 200) => ({ ok: status === 200, status, headers: new Headers(), json: async () => body });

test('daily fetch uses bearer auth and deduplicates IDs', async () => {
  let calls = 0;
  const api = client(async (url, options) => {
    calls++;
    assert.equal(url, `https://wardogsbot.com/api/v1/players/${id}`);
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    return reply({ ok: true, stats: { kills: 12, deaths: 4 } });
  });
  const players = await api.refreshPlayerSummaries([id, id]);
  assert.equal(players[id].kd, 3);
  assert.equal(calls, 1);
});

test('handles zero deaths and missing players without inventing stats', async () => {
  const api = client(async (url) => url.endsWith(id) ? reply({ ok: true, player: { kills: 7, deaths: 0 } }) : reply({}, 404));
  const stats = await api.refreshPlayerSummaries([id, '76561198000000002', 'invalid']);
  assert.equal(Object.keys(stats).length, 1);
  assert.equal(stats[id].kd, 7);
});

test('fails on auth errors, API errors and undocumented or invalid stats', async () => {
  for (const response of [reply({}, 401), reply({}, 403), reply({ ok: false }), reply({ ok: true }), reply({ ok: true, stats: { kills: -1, deaths: 2 } })]) {
    await assert.rejects(client(async () => response).refreshPlayerSummaries([id]));
  }
});

test('honours rate-limit cooldown across calls', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return { ...reply({}, 429), headers: new Headers({ 'Retry-After': '120' }) }; });
  await assert.rejects(api.refreshPlayerSummaries([id]));
  await assert.rejects(api.refreshPlayerSummaries([id]));
  assert.equal(calls, 1);
});

test('does not request stats without a key', async () => {
  const api = client(() => { throw new Error('Unexpected fetch'); }, '');
  assert.equal((await api.getPlayerSummaries([id])).size, 0);
});

test('page reads never fetch, even when no snapshot exists', async () => {
  const api = client(() => { throw new Error('Unexpected fetch'); });
  assert.equal((await api.getPlayerSummaries([id])).size, 0);
  assert.equal((await api.getPlayerSummaries([id])).size, 0);
});
