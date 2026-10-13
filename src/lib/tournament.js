const config = require('../config');

const API_BASE = 'https://wardogsleague.net/api/v1/team';
// The Members page can re-render on every visit; cache briefly so repeat loads don't
// re-hit the tournament API for data that only changes when someone joins/leaves the team.
const CACHE_TTL_MS = 60_000;
let cache = null; // { discordIds: Set<string>, expiresAt: number }

function isConfigured() {
  return Boolean(config.TOURNAMENT_API_KEY);
}

async function fetchMembers() {
  const response = await fetch(`${API_BASE}/members`, {
    headers: { Authorization: `Bearer ${config.TOURNAMENT_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Tournament API returned ${response.status}.`);
  const data = await response.json();
  if (!Array.isArray(data.members)) throw new Error('Tournament API returned an unrecognised members response.');
  return data.members;
}

// Returns the set of Discord IDs currently on the tournament team's roster.
async function getRegisteredDiscordIds() {
  if (!isConfigured()) throw new Error('Tournament API key is not configured.');
  if (cache && cache.expiresAt > Date.now()) return cache.discordIds;
  const members = await fetchMembers();
  const discordIds = new Set(members.map((member) => String(member.user?.discordId || '')).filter(Boolean));
  cache = { discordIds, expiresAt: Date.now() + CACHE_TTL_MS };
  return discordIds;
}

module.exports = { isConfigured, getRegisteredDiscordIds };
