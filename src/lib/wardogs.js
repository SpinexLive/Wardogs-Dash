const config = require('../config');

const API_URL = 'https://wardogsbot.com/api/v1';
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();
const pending = new Map();
let requestTimes = [];
let blockedUntil = 0;

function isConfigured() { return Boolean(config.WARDOGS_API_KEY); }

// The published schema only describes the `ok` envelope. Accept explicit stats
// containers, but never turn an unknown response shape into fabricated zeroes.
function parseSummary(data) {
  const candidates = [data.stats, data.player?.stats, data.player, data.summary, data.data?.stats, data.data?.player, data.data, data];
  const stats = candidates.find((value) => value && value.kills != null && value.deaths != null);
  if (!stats) throw new Error('Wardogs returned an unrecognised player stats response.');
  const kills = Number(stats.kills);
  const deaths = Number(stats.deaths);
  if (![kills, deaths].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('Wardogs returned invalid kills or deaths.');
  }
  return { kills, deaths, kd: deaths ? kills / deaths : kills };
}

async function fetchSummary(id) {
  const now = Date.now();
  requestTimes = requestTimes.filter((time) => now - time < 60_000);
  // Leave room below the provider's 120/minute limit; all page requests share this budget.
  if (now < blockedUntil || requestTimes.length >= 100) throw new Error('Wardogs request limit reached; try again shortly.');
  requestTimes.push(now);
  const response = await fetch(`${API_URL}/players/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${config.WARDOGS_API_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 429) {
    const retry = response.headers.get('Retry-After');
    const delay = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Date.parse(retry) - now;
    blockedUntil = now + Math.max(60_000, Number.isFinite(delay) ? delay : 0);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Wardogs player lookup failed: ${response.status}`);
  const data = await response.json();
  if (data.ok !== true) throw new Error('Wardogs player lookup was unsuccessful.');
  return parseSummary(data);
}

function getPlayerSummary(id) {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return Promise.resolve(cached.value);
  if (pending.has(id)) return pending.get(id);
  const request = fetchSummary(id).then((value) => {
    cache.set(id, { value, fetchedAt: Date.now() });
    return value;
  }).finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

async function getPlayerSummaries(steamIds) {
  if (!isConfigured()) return new Map();
  const ids = [...new Set(steamIds.map(String))].filter((id) => /^\d{17}$/.test(id));
  const summaries = new Map();
  let cursor = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (cursor < ids.length && !failure) {
      const id = ids[cursor++];
      try {
        const value = await getPlayerSummary(id);
        if (value) summaries.set(id, value);
      } catch (error) { failure = error; }
    }
  }));
  // Do not show a partial clan aggregate or publish an incomplete leaderboard.
  if (failure) throw failure;
  return summaries;
}

module.exports = { isConfigured, getPlayerSummaries };
