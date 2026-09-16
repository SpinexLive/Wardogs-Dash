const discord = require('./discord');
const store = require('./store');
const steamStore = require('./steamStore');
const rosterDb = require('./rosterDb');

function displayName(member) {
  return member.nick || member.user.global_name || member.user.username || 'Unknown member';
}

function escapeMarkdown(value) {
  return String(value).replace(/([`*_~|>])/g, '\\$1');
}

function rankedLines(rows, key, format) {
  const ranked = rows.filter((row) => row[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 10);
  return ranked.length ? ranked.map((row, index) => `**${index + 1}.** ${escapeMarkdown(row.name)} — ${format(row[key])}`).join('\n') : 'No tracked results yet.';
}

async function buildLeaderboardPayload() {
  const access = store.readAccess();
  const steamIds = steamStore.readSteamIds();
  const guildMembers = await discord.getGuildMembers();
  const clanMembers = guildMembers.filter((member) => member.roles.some((role) => access.memberRoleIds.includes(role)));
  const linked = clanMembers.map((member) => ({ name: displayName(member), steamId: steamIds[member.user.id] })).filter((member) => member.steamId);
  const ids = linked.map((member) => String(member.steamId));
  const cashTotals = rosterDb.getCashTotals(ids);
  const matchStats = rosterDb.getMatchStats(ids);
  const rows = linked.map((member) => ({
    name: member.name,
    cash: cashTotals.get(String(member.steamId)) || 0,
    kills: matchStats.get(String(member.steamId))?.totalKills || 0,
  }));

  return {
    embeds: [{
      color: 0xa61b1b,
      title: 'Wardogs Clan Leaderboards',
      description: 'Live totals from the Wardogs server. Updated every 60 seconds.',
      thumbnail: { url: 'attachment://wardogs-logo.png' },
      fields: [
        { name: '💰 Top 10 Cash Earners', value: rankedLines(rows, 'cash', (value) => `$${value.toLocaleString()}`), inline: true },
        { name: '⚔️ Top 10 Killers', value: rankedLines(rows, 'kills', (value) => `${value.toLocaleString()} kills`), inline: true },
      ],
      footer: { text: 'Wardogs Dash • Full-match performance tracking' },
      timestamp: new Date().toISOString(),
    }],
  };
}

async function updateLeaderboard() {
  const access = store.readAccess();
  // A channel alone does not publish anything: the admin must use Send once.
  if (!access.leaderboardChannelId || !access.leaderboardMessageId) return { skipped: true };
  const payload = await buildLeaderboardPayload();
  return discord.updateLeaderboardMessage(access.leaderboardChannelId, access.leaderboardMessageId, payload);
}

async function sendLeaderboard() {
  const access = store.readAccess();
  if (!access.leaderboardChannelId) throw new Error('Choose a leaderboard channel and save Settings first.');
  const payload = await buildLeaderboardPayload();
  if (access.leaderboardMessageId) {
    try { return await discord.updateLeaderboardMessage(access.leaderboardChannelId, access.leaderboardMessageId, payload); }
    catch (_) { /* Message/channel was removed; create a replacement below. */ }
  }
  const message = await discord.createLeaderboardMessage(access.leaderboardChannelId, payload);
  store.writeAccess({ ...access, leaderboardMessageId: message.id });
  return message;
}

module.exports = { sendLeaderboard, updateLeaderboard };
