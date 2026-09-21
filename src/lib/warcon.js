const config = require('../config');

const API_ORIGIN = 'https://console.warcon.app';
const CACHE_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_CONCURRENT_REQUESTS = 4;
const cache = new Map();

function isConfigured() {
  return Boolean(config.WARCON_API_KEY && config.WARCON_SERVER_ID);
}

function summaryFromDossier(dossier) {
  const summary = dossier?.summary || {};
  const kills = Number(summary.kills) || 0;
  const deaths = Number(summary.deaths) || 0;
  const minutes = Number(summary.minutes) || 0;
  return {
    kills,
    deaths,
    sessions: Number(summary.sessions) || 0,
    minutes,
    kd: deaths ? kills / deaths : kills,
    kpm: minutes ? kills / minutes : 0,
  };
}

async function getPlayerSummary(steamId) {
  const id = String(steamId);
  const cached = cache.get(id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.value;
  const response = await fetch(`${API_ORIGIN}/api/servers/${encodeURIComponent(config.WARCON_SERVER_ID)}/players/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${config.WARCON_API_KEY}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Warcon player lookup failed: ${response.status}`);
  const data = await response.json();
  if (!data.ok || !data.dossier) throw new Error('Warcon returned an invalid player dossier.');
  const value = summaryFromDossier(data.dossier);
  cache.set(id, { value, fetchedAt: Date.now() });
  return value;
}

async function getPlayerSummaries(steamIds) {
  if (!isConfigured() || !steamIds.length) return new Map();
  const ids = [...new Set(steamIds.map(String))];
  const summaries = new Map();
  const errors = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try { summaries.set(id, await getPlayerSummary(id)); }
      catch (err) { errors.push(err); }
    }
  });
  await Promise.all(workers);
  // An invalid key or outage fails every request; surface that rather than silently
  // rendering an empty performance table. A missing individual dossier stays blank.
  if (errors.length === ids.length) throw errors[0];
  return summaries;
}

async function getKills({ victim, killer, before, beforeTime, limit = 20 } = {}) {
  if (!isConfigured()) throw new Error('Warcon API is not configured.');
  const params = new URLSearchParams({ limit: String(Math.min(200, Math.max(1, limit))) });
  if (victim) params.set('victim', String(victim));
  if (killer) params.set('killer', String(killer));
  if (before) params.set('before', String(before));
  if (beforeTime) params.set('beforeTime', String(beforeTime));
  const response = await fetch(`${API_ORIGIN}/api/servers/${encodeURIComponent(config.WARCON_SERVER_ID)}/kills?${params}`, {
    headers: { Authorization: `Bearer ${config.WARCON_API_KEY}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Warcon kill-feed lookup failed: ${response.status}`);
  const data = await response.json();
  if (!data.ok || !Array.isArray(data.kills)) throw new Error('Warcon returned an invalid kill-feed response.');
  return data.kills;
}

module.exports = { isConfigured, getPlayerSummaries, getKills };
