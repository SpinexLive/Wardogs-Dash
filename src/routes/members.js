const express = require('express');
const discord = require('../lib/discord');
const store = require('../lib/store');
const steamStore = require('../lib/steamStore');
const rcon = require('../lib/rcon');
const rosterDb = require('../lib/rosterDb');
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
    const cashTotals = rosterDb.getCashTotals(Object.values(steamIds));

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
      return {
        ...member,
        steamId,
        vip: Boolean(steamId && reservedSlots.has(steamId)),
        online: Boolean(livePlayer),
        kills: livePlayer?.kills ?? null,
        deaths: livePlayer?.deaths ?? null,
        kd: livePlayer ? (Number(livePlayer.deaths) ? (Number(livePlayer.kills) / Number(livePlayer.deaths)).toFixed(2) : Number(livePlayer.kills).toFixed(2)) : null,
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
