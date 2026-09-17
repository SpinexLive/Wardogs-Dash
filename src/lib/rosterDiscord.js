const discord = require('./discord');
const store = require('./store');
const rosterDb = require('./rosterDb');

const emojiKeys = ['squadLeader', 'infantry', 'armour', 'fob', 'mortar', 'pilot', 'recon', 'commander', 'pending', 'confirmed', 'declined'];
const templateIconKey = { infantry: 'infantry', armour: 'armour', fob: 'fob', pilot: 'pilot', recon: 'recon', commander: 'commander' };

function emojiMarkup(emoji, fallback) { return emoji ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : fallback; }
function escapeEmbed(value) { return String(value || '').replace(/([*_`~|>])/g, '\\$1'); }

async function buildPayload(eventId) {
  const roster = rosterDb.getRoster(eventId);
  if (!roster) throw new Error('Save the roster before sharing it to Discord.');
  const access = store.readAccess();
  const emojiIds = access.rosterEmojiMap || {};
  const guildEmojis = await discord.getGuildEmojis();
  const emojis = Object.fromEntries(emojiKeys.map((key) => [key, emojiMarkup(guildEmojis.find((emoji) => emoji.id === emojiIds[key]), key === 'confirmed' ? '✅' : key === 'declined' ? '❌' : key === 'pending' ? '⏳' : '•')]));
  const confirmations = rosterDb.getRosterConfirmations(eventId);
  const fields = roster.squads.slice(0, 25).map((squad) => {
    const leaderCount = Number(squad.leader_slots || 0);
    const playerCount = Number(squad.player_slots || 0);
    const lines = squad.assignments.map((player) => {
      const slotIcon = player.position < leaderCount ? emojis.squadLeader : (squad.template === 'fob' && player.position >= leaderCount + playerCount ? emojis.mortar : emojis[templateIconKey[squad.template]] || '•');
      const status = confirmations.get(player.player_id) || 'pending';
      return `${emojis[status]} ${slotIcon} ${escapeEmbed(player.player_name)}`;
    });
    return { name: `${emojis[templateIconKey[squad.template]] || '•'} ${escapeEmbed(squad.name)}`, value: lines.join('\n') || 'No players assigned.', inline: false };
  });
  const start = Number(roster.event_start || 0);
  return {
    allowed_mentions: { parse: [] },
    embeds: [{ color: 0xa61b1b, title: roster.event_name, description: start ? `Starts: <t:${start}:F>\n<t:${start}:R>` : 'Start time pending.', fields, footer: { text: 'Wardogs roster • Use a button below to confirm attendance' } }],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: 'Confirm', custom_id: `WD-confirm:${eventId}` },
      { type: 2, style: 4, label: 'Decline', custom_id: `WD-Decline:${eventId}` },
    ] }],
  };
}

async function publishRoster(eventId, channelId) {
  if (!channelId) throw new Error('Raid-Helper did not return the event signup channel.');
  const payload = await buildPayload(eventId);
  const existing = rosterDb.getRosterDiscordMessage(eventId);
  if (existing && existing.channel_id === channelId) {
    try { return await discord.updateChannelMessage(existing.channel_id, existing.message_id, payload); }
    catch (_) { /* Recreate a removed message. */ }
  }
  const message = await discord.createChannelMessage(channelId, payload);
  rosterDb.setRosterDiscordMessage(eventId, channelId, message.id);
  return message;
}

async function respondToRosterButton(eventId, playerId, status) {
  const roster = rosterDb.getRoster(eventId);
  const assigned = roster?.squads.some((squad) => squad.assignments.some((player) => player.player_id === playerId));
  if (!assigned) return { ok: false, message: 'You are not assigned to this roster.' };
  rosterDb.setRosterConfirmation(eventId, playerId, status);
  const message = rosterDb.getRosterDiscordMessage(eventId);
  if (message) await discord.updateChannelMessage(message.channel_id, message.message_id, await buildPayload(eventId));
  return { ok: true, message: status === 'confirmed' ? 'You are confirmed.' : 'You have declined.' };
}

module.exports = { publishRoster, respondToRosterButton };
