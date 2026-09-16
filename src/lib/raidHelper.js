const config = require('../config');
const API_BASE = 'https://raid-helper.xyz/api/v4';
const roleMap = { infantry: 'infantry', armour: 'armour', pilot: 'pilot', fob: 'fob', commander: 'commander' };

async function request(path) {
  if (!config.RAID_HELPER_API_TOKEN) throw new Error('Raid-Helper API token is not configured.');
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: config.RAID_HELPER_API_TOKEN, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Raid-Helper API returned ${response.status}.`);
  return response.json();
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
  const events = await Promise.all(matches.map(async (event) => formatEvent(await request(`/events/${encodeURIComponent(event.id)}`))));
  return events.sort((a, b) => a.startTime - b.startTime);
}
function normaliseRole(signup) { return roleMap[String(signup.cClassName || signup.roleName || '').toLowerCase()] || null; }
async function getRosterEvent(eventId) {
  const event = await request(`/events/${encodeURIComponent(eventId)}`);
  if (!isMatch(event)) throw new Error('This event is not an eligible match.');
  return { ...formatEvent(event), players: (event.signUps || event.signups || []).filter(isRosterEligible).map((signup) => ({ id: String(signup.userId || signup.id), name: signup.name || 'Unknown player', role: normaliseRole(signup) })).filter((player) => player.role) };
}
module.exports = { getRosterEvents, getRosterEvent };
