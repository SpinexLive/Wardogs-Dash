const express = require('express');
const discord = require('../lib/discord');
const store = require('../lib/store');
const steamStore = require('../lib/steamStore');
const rcon = require('../lib/rcon');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const MAX_STEAM_ID_LENGTH = 64;

async function loadMembers(memberRoleIds) {
  if (!memberRoleIds.length) return [];
  const members = await discord.getGuildMembers();
  return members
    .filter((member) => member.roles.some((roleId) => memberRoleIds.includes(roleId)))
    .map((member) => ({
      id: member.user.id,
      nickname: member.nick || member.user.global_name || member.user.username,
      roles: member.roles,
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
}

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const access = store.readAccess();
    const members = await loadMembers(access.memberRoleIds);
    const steamIds = steamStore.readSteamIds();

    let vipError = null;
    let reservedSlots = new Set();
    if (rcon.isConfigured()) {
      try {
        reservedSlots = new Set(await rcon.getReservedSlots());
      } catch (err) {
        vipError = 'Could not reach the RCON server to check VIP status.';
      }
    }

    const membersWithVip = members.map((member) => {
      const steamId = steamIds[member.id] || null;
      return {
        ...member,
        steamId,
        vip: Boolean(steamId && reservedSlots.has(steamId)),
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
      },
      hasMemberRoles: access.memberRoleIds.length > 0,
      vipConfigured: rcon.isConfigured(),
      vipError,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/steam-id', requireAuth, requireAdmin, (req, res, next) => {
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
