const express = require('express');
const discord = require('../lib/discord');
const store = require('../lib/store');
const steamStore = require('../lib/steamStore');
const rcon = require('../lib/rcon');
const rosterDb = require('../lib/rosterDb');
const warcon = require('../lib/warcon');
const { requireAuth, requireDashboardAccess } = require('../middleware/auth');

const router = express.Router();
const MAX_STEAM_ID_LENGTH = 64;

function formatPlaytime(minutes) {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const remainingMinutes = total % 60;
  return days ? `${days}d ${hours}h ${remainingMinutes}m` : `${hours}h ${remainingMinutes}m`;
}

function discordAvatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=64`;
  // Discord's fallback avatars are deterministic for accounts without a custom image.
  const index = Number(BigInt(user.id) % 5n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function loadMembers(memberRoleIds) {
  if (!memberRoleIds.length) return [];
  const members = await discord.getGuildMembers();
  return members
    .filter((member) => member.roles.some((roleId) => memberRoleIds.includes(roleId)))
    .map((member) => ({
      id: member.user.id,
      nickname: member.nick || member.user.global_name || member.user.username,
      avatar: discordAvatarUrl(member.user),
      roles: member.roles,
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
}

router.get('/', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const access = store.readAccess();
    const members = await loadMembers(access.memberRoleIds);
    const steamIds = steamStore.readSteamIds();
    const cashTotals = rosterDb.getCashTotals(Object.values(steamIds));
    let performance = new Map();
    let performanceError = null;
    if (warcon.isConfigured()) {
      try {
        performance = await warcon.getPlayerSummaries(Object.values(steamIds));
      } catch (_) {
        performanceError = 'Warcon player performance data is temporarily unavailable.';
      }
    } else {
      performanceError = 'Warcon performance data is unavailable until its API key and server ID are configured.';
    }

    let vipError = null;
    let reservedSlots = new Set();
    let connectedPlayers = new Map();
    if (rcon.isConfigured()) {
      try {
        const [reserved, players] = await Promise.all([rcon.getReservedSlots(), rcon.getPlayers()]);
        reservedSlots = new Set(reserved);
        connectedPlayers = new Map(players.map((player) => [String(player.steamId), player]));
      } catch (err) {
        vipError = 'Could not reach the RCON server to check live player or VIP status.';
      }
    }

    const membersWithVip = members.map((member) => {
      const steamId = steamIds[member.id] || null;
      const livePlayer = steamId ? connectedPlayers.get(String(steamId)) : null;
      const stats = steamId ? performance.get(String(steamId)) : null;
      return {
        ...member,
        steamId,
        vip: Boolean(steamId && reservedSlots.has(steamId)),
        online: Boolean(livePlayer),
        kills: stats?.kills ?? null,
        deaths: stats?.deaths ?? null,
        sessions: stats?.sessions ?? null,
        minutes: stats?.minutes ?? null,
        playtime: stats ? formatPlaytime(stats.minutes) : null,
        kd: stats ? stats.kd.toFixed(2) : null,
        kpm: stats ? stats.kpm.toFixed(2) : null,
        cashEarned: steamId ? (cashTotals.get(String(steamId)) || 0) : null,
        isRecruit: Boolean(access.recruitRankRoleId && member.roles.includes(access.recruitRankRoleId)),
        isMemberRank: Boolean(access.memberRankRoleId && member.roles.includes(access.memberRankRoleId)),
      };
    });

    res.render('members', {
      active: 'members',
      members: membersWithVip,
      memberStats: {
        linkedSteam: membersWithVip.filter((member) => member.steamId).length,
        vipEnabled: membersWithVip.filter((member) => member.vip).length,
        online: membersWithVip.filter((member) => member.online).length,
      },
      hasMemberRoles: access.memberRoleIds.length > 0,
      vipConfigured: rcon.isConfigured(),
      vipError,
      performanceError,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/steam-id', requireAuth, requireDashboardAccess, (req, res, next) => {
  try {
    const { userId, steamId } = req.body;
    if (!userId) return res.redirect('/members');

    const steamIds = steamStore.readSteamIds();
    const trimmed = (steamId || '').trim().slice(0, MAX_STEAM_ID_LENGTH);
    if (trimmed) {
      steamIds[userId] = trimmed;
    } else {
      delete steamIds[userId];
    }
    steamStore.writeSteamIds(steamIds);
    res.redirect('/members');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
