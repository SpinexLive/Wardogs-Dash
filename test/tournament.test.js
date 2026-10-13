const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function client(fetch, key = 'test-key') {
  const context = { module: { exports: {} }, require: () => ({ TOURNAMENT_API_KEY: key }), fetch, AbortSignal };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/lib/tournament.js'), 'utf8'), context);
  return context.module.exports;
}
const reply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

test('fetches members with bearer auth and returns their discord IDs', async () => {
  let calls = 0;
  const api = client(async (url, options) => {
    calls++;
    assert.equal(url, 'https://wardogsleague.net/api/v1/team/members');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    return reply({ members: [{ user: { discordId: '1' } }, { user: { discordId: '2' } }] });
  });
  const ids = await api.getRegisteredDiscordIds();
  assert.deepEqual([...ids].sort(), ['1', '2']);
  assert.equal(calls, 1);
});

test('caches results between calls', async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    return reply({ members: [{ user: { discordId: '1' } }] });
  });
  await api.getRegisteredDiscordIds();
  await api.getRegisteredDiscordIds();
  assert.equal(calls, 1);
});

test('fails on auth errors, API errors and unrecognised responses', async () => {
  for (const response of [reply({}, 401), reply({}, 500), reply({ notMembers: [] })]) {
    await assert.rejects(client(async () => response).getRegisteredDiscordIds());
  }
});

test('rejects without a key and never calls fetch', async () => {
  const api = client(() => { throw new Error('Unexpected fetch'); }, '');
  await assert.rejects(api.getRegisteredDiscordIds());
  assert.equal(api.isConfigured(), false);
});
