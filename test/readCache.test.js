const { test } = require('node:test');
const assert = require('node:assert/strict');
const cachedRead = require('../src/lib/readCache');

test('concurrent cold reads share one request and subsequent reads use the cache', async () => {
  let calls = 0;
  const read = cachedRead(async () => { calls++; return [1]; });
  const [a, b] = await Promise.all([read(), read()]);
  assert.equal(a, b);
  assert.equal(await read(), a);
  assert.equal(calls, 1);
});

test('stale reads return while refresh is pending', async () => {
  let finish;
  let calls = 0;
  const read = cachedRead(() => ++calls === 1 ? 'old' : new Promise((resolve) => { finish = resolve; }), { freshMs: 0 });
  assert.equal(await read(), 'old');
  assert.equal(await read(), 'old');
  assert.equal(await read(), 'old');
  assert.equal(calls, 2);
  finish('new');
});

test('failed reads are not retried on every page change', async () => {
  let calls = 0;
  const read = cachedRead(async () => { calls++; throw new Error('offline'); });
  await assert.rejects(read(), /offline/);
  await assert.rejects(read(), /offline/);
  assert.equal(calls, 1);
});
