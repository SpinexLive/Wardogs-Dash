const discord = require('./discord');
const store = require('./store');
const rosterDb = require('./rosterDb');

const emojiKeys = ['squadLeader', 'infantry', 'armour', 'fob', 'mortar', 'pilot', 'recon', 'commander', 'pending', 'confirmed', 'declined'];
const templateIconKey = { infantry: 'infantry', armour: 'armour', fob: 'fob', pilot: 'pilot', recon: 'recon', commander: 'commander' };

function emojiMarkup(emoji, fallback) { return emoji ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : fallback; }
function escapeEmbed(value) { return String(value || '').replace(/([*_`~|>])/g, '\\$1'); }
function rosterButtons(eventId) {
  return [{ type: 1, components: [
    { type: 2, style: 3, label: 'Confirm', custom_id: `WD-confirm:${eventId}` },
    { type: 2, style: 4, label: 'Decline', custom_id: `WD-Decline:${eventId}` },
  ] }];
}

async function buildPayload(eventId, { mentionAssigned = false } = {}) {
  const roster = rosterDb.getRoster(eventId);
  if (!roster) throw new Error('Save the roster before sharing it to Discord.');
  const access = store.readAccess();
  const emojiIds = access.rosterEmojiMap || {};
  const guildEmojis = await discord.getGuildEmojis();
  const emojis = Object.fromEntries(emojiKeys.map((key) => [key, emojiMarkup(guildEmojis.find((emoji) => emoji.id === emojiIds[key]), key === 'confirmed' ? '✅' : key === 'declined' ? '❌' : key === 'pending' ? '⏳' : '•')]));
  const confirmations = rosterDb.getRosterConfirmations(eventId);
  const assignedMemberIds = [...new Set(roster.squads.flatMap((squad) => squad.assignments.map((player) => String(player.player_id))).filter((id) => /^\d{17,20}$/.test(id)))];
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
  const payload = {
    // Explicitly allow only rostered Discord users; roles and @everyone cannot be pinged.
    allowed_mentions: { parse: [], users: mentionAssigned ? assignedMemberIds : [] },
    embeds: [{ color: 0xa61b1b, title: roster.event_name, thumbnail: { url: 'https://45-151-81-182.sslip.io/images/wardogs-logo.png' }, description: start ? `<t:${start}:F>\nhttps://ptb.discord.com/channels/1332320879073296404/1546197103498363031` : 'Start time pending.', fields, footer: { text: '• Please confirm you attendance' } }],
    components: rosterButtons(eventId),
  };
  if (mentionAssigned && assignedMemberIds.length) payload.content = `${assignedMemberIds.map((id) => `<@${id}>`).join(' ')}`;
  return payload;
}

async function publishRoster(eventId, channelId) {
  if (!channelId) throw new Error('Raid-Helper did not return the event signup channel.');
  const existing = rosterDb.getRosterDiscordMessage(eventId);
  if (existing && existing.channel_id === channelId) {
    try { return await discord.updateChannelMessage(existing.channel_id, existing.message_id, await buildPayload(eventId)); }
    catch (_) { /* Recreate a removed message. */ }
  }
  const message = await discord.createChannelMessage(channelId, await buildPayload(eventId, { mentionAssigned: true }));
  rosterDb.setRosterDiscordMessage(eventId, channelId, message.id);
  return message;
}

async function sendPendingReminder(eventId, channelId) {
  if (!channelId) throw new Error('Raid-Helper did not return the event signup channel.');
  const roster = rosterDb.getRoster(eventId);
  if (!roster) throw new Error('Save the roster before sending a reminder.');
  const confirmations = rosterDb.getRosterConfirmations(eventId);
  const pendingMemberIds = [...new Set(roster.squads.flatMap((squad) => squad.assignments.map((player) => String(player.player_id))).filter((id) => /^\d{17,20}$/.test(id) && (confirmations.get(id) || 'pending') === 'pending'))];
  if (!pendingMemberIds.length) throw new Error('There are no pending roster members to remind.');

  const previousReminder = rosterDb.getRosterDiscordReminder(eventId);
  if (previousReminder) await discord.deleteChannelMessage(previousReminder.channel_id, previousReminder.message_id);

  const message = await discord.createChannelMessage(channelId, {
    content: `${pendingMemberIds.map((id) => `<@${id}>`).join(' ')}\nPlease confirm or decline your roster place`,
    allowed_mentions: { parse: [], users: pendingMemberIds },
  });
  rosterDb.setRosterDiscordReminder(eventId, channelId, message.id);
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

module.exports = { publishRoster, sendPendingReminder, respondToRosterButton };
