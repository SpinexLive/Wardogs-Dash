const config = require('../config');
const API_BASE = 'https://raid-helper.xyz/api/v4';
const roleMap = { infantry: 'infantry', armour: 'armour', pilot: 'pilot', fob: 'fob', commander: 'commander', recon: 'recon', antiair: 'antiAir', 'anti-air': 'antiAir', aa: 'antiAir' };

// Raid-Helper's own response time is what actually makes the player list feel slow;
// steam ID lookups and stat checks are local and near-instant. Cache briefly so
// repeat page loads (and the roster list's per-event lookups) don't re-pay that cost.
const CACHE_TTL_MS = 15_000;
const cache = new Map();

async function request(path) {
  if (!config.RAID_HELPER_API_TOKEN) throw new Error('Raid-Helper API token is not configured.');
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: config.RAID_HELPER_API_TOKEN, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Raid-Helper API returned ${response.status}.`);
  const data = await response.json();
  cache.set(path, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
function eventName(event) { return String(event.title || event.name || event.displayTitle || 'Untitled match'); }
function eventStart(event) { return Number(event.startTime || event.start || event.time || 0); }
function isMatch(event) { return /^⚔️/.test(eventName(event)); }
function isRosterEligible(signup) {
  return !['tentative', 'absence'].includes(String(signup.cClassName || signup.className || '').toLowerCase());
}
function formatEvent(event) {
  const signups = event.signUps || event.signups || [];
  return { id: String(event.id), name: eventName(event), startTime: eventStart(event), signups: signups.length ? signups.filter(isRosterEligible).length : Number(event.signUpCount || 0) };
}

async function getRosterEvents() {
  const payload = await request(`/servers/${encodeURIComponent(config.DISCORD_GUILD_ID)}/events`);
  const summaries = payload.postedEvents || payload.events || [];
  const matches = summaries.filter((event) => isMatch(event) && eventStart(event) >= Math.floor(Date.now() / 1000));
  // formatEvent already falls back to the summary's approximate signUpCount, so the
  // list page never needs to fetch every event's full (and much larger) signup payload.
  return matches.map(formatEvent).sort((a, b) => a.startTime - b.startTime);
}
// Falls back to the raw sign-up class so unmapped roles still appear in the roster
// instead of silently vanishing; only tentative/absence sign-ups should be excluded.
function normaliseRole(signup) {
  const raw = String(signup.cClassName || signup.roleName || '').toLowerCase();
  return roleMap[raw] || raw || 'infantry';
}
async function getRosterEvent(eventId) {
  const event = await request(`/events/${encodeURIComponent(eventId)}`);
  if (!isMatch(event)) throw new Error('This event is not an eligible match.');
  return { ...formatEvent(event), channelId: String(event.channelId || event.channel?.id || event.channel_id || ''), players: (event.signUps || event.signups || []).filter(isRosterEligible).map((signup) => ({ id: String(signup.userId || signup.id), name: signup.name || 'Unknown player', role: normaliseRole(signup) })) };
}
module.exports = { getRosterEvents, getRosterEvent };
