const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function scheduler(fail = false) {
  let snapshot = { players: { old: { kills: 1 } } };
  let calls = 0;
  const context = {
    module: { exports: {} }, console: { info() {}, warn() {} },
    require(name) {
      if (name === './statsSnapshot') return { read: () => snapshot, write: (value) => { snapshot = value; } };
      if (name === './steamStore') return { readSteamIds: () => ({ member: '76561198000000001' }) };
      return { isConfigured: () => true, refreshPlayerSummaries: async () => {
        calls++;
        if (fail) throw new Error('offline');
        return { new: { kills: 2 } };
      } };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/lib/dailyStats.js'), 'utf8'), context);
  return { api: context.module.exports, state: () => ({ snapshot, calls }) };
}

test('next run is 03:00 UTC across midnight and British summer time', () => {
  const { api } = scheduler();
  for (const [now, expected] of [
    ['2026-07-01T02:59:00Z', '2026-07-01T03:00:00.000Z'],
    ['2026-07-01T03:00:00Z', '2026-07-02T03:00:00.000Z'],
    ['2026-12-31T23:00:00Z', '2027-01-01T03:00:00.000Z'],
  ]) assert.equal(api.nextRefresh(new Date(now)).toISOString(), expected);
});

test('one attempt per UTC date, with a new run the following day', async () => {
  const { api, state } = scheduler();
  await api.refresh(new Date('2026-07-01T03:00:00Z'));
  await api.refresh(new Date('2026-07-01T03:01:00Z'));
  assert.equal(state().calls, 1);
  assert.equal(state().snapshot.players.new.kills, 2);
  await api.refresh(new Date('2026-07-02T03:00:00Z'));
  assert.equal(state().calls, 2);
});

test('failed run preserves previous stats and does not retry that day', async () => {
  const { api, state } = scheduler(true);
  await api.refresh(new Date('2026-07-01T03:00:00Z'));
  await api.refresh(new Date('2026-07-01T03:01:00Z'));
  assert.equal(state().calls, 1);
  assert.equal(state().snapshot.players.old.kills, 1);
});
