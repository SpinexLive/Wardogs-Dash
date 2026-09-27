const express = require('express');
const discord = require('../lib/discord');
const store = require('../lib/store');
const steamStore = require('../lib/steamStore');
const rcon = require('../lib/rcon');
const wardogs = require('../lib/wardogs');
const { requireAuth, requireDashboardAccess } = require('../middleware/auth');

const router = express.Router();
const MAX_STEAM_ID_LENGTH = 64;

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
    let performance = new Map();
    let performanceError = null;
    if (wardogs.isConfigured()) {
      try {
        performance = await wardogs.getPlayerSummaries(members.map((member) => steamIds[member.id]).filter(Boolean));
      } catch (_) {
        performanceError = 'Wardogs player performance data is temporarily unavailable.';
      }
    } else {
      performanceError = 'Wardogs performance data is unavailable until its API key is configured.';
    }

    if (wardogs.isConfigured() && !performance.size && members.some((member) => steamIds[member.id])) {
      performanceError = 'No saved player stats yet. Stats refresh daily at 03:00 GMT.';
    }

    let serverError = null;
    let connectedPlayers = new Map();
    if (rcon.isConfigured()) {
      try {
        const players = await rcon.getPlayers();
        connectedPlayers = new Map(players.map((player) => [String(player.steamId), player]));
      } catch (err) {
        serverError = 'Could not reach the RCON server to check live player status.';
      }
    }

    const membersWithLiveStatus = members.map((member) => {
      const steamId = steamIds[member.id] || null;
      const livePlayer = steamId ? connectedPlayers.get(String(steamId)) : null;
      const stats = steamId ? performance.get(String(steamId)) : null;
      return {
        ...member,
        steamId,
        online: Boolean(livePlayer),
        kills: stats?.kills ?? null,
        deaths: stats?.deaths ?? null,
        kd: stats ? stats.kd.toFixed(2) : null,
        isRecruit: Boolean(access.recruitRankRoleId && member.roles.includes(access.recruitRankRoleId)),
        isMemberRank: Boolean(access.memberRankRoleId && member.roles.includes(access.memberRankRoleId)),
      };
    });

    res.render('members', {
      active: 'members',
      members: membersWithLiveStatus,
      memberStats: {
        linkedSteam: membersWithLiveStatus.filter((member) => member.steamId).length,
        online: membersWithLiveStatus.filter((member) => member.online).length,
      },
      hasMemberRoles: access.memberRoleIds.length > 0,
      serverConfigured: rcon.isConfigured(),
      serverError,
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
