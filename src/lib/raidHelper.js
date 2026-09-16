const config = require('../config');

function eventName(event) {
  return String(event.name || event.title || event.event_name || 'Untitled event');
}

function toEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function getEventStart(event) {
  return event.start || event.startTime || event.start_time || event.time || event.date || null;
}

function formatEvent(event) {
  const signups = Array.isArray(event.signups) ? event.signups : [];
  return {
    id: event.id || event.eventId || event.message_id || eventName(event),
    name: eventName(event),
    start: getEventStart(event),
    description: event.description || event.desc || '',
    signups: signups.length || Number(event.signup_count || event.signups_count || 0),
    capacity: event.limit || event.max || event.max_signups || null,
  };
}

async function getRosterEvents() {
  if (!config.RAID_HELPER_EVENTS_URL || !config.RAID_HELPER_API_TOKEN) {
    return { configured: false, events: [] };
  }

  const url = config.RAID_HELPER_EVENTS_URL.replace('{guildId}', config.DISCORD_GUILD_ID);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.RAID_HELPER_API_TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Raid-Helper API returned ${response.status}.`);

  const events = toEvents(await response.json())
    .filter((event) => /^⚔️/.test(eventName(event)))
    .map(formatEvent)
    .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));
  return { configured: true, events };
}

module.exports = { getRosterEvents };
