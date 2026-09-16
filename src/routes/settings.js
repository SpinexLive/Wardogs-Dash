const express = require('express');
const discord = require('../lib/discord');
const store = require('../lib/store');
const leaderboard = require('../lib/leaderboard');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

async function loadSortedRoles() {
  const roles = await discord.getGuildRoles();
  return roles.filter((role) => role.name !== '@everyone').sort((a, b) => b.position - a.position);
}

async function renderSettings(req, res, overrides = {}) {
  const { status, ...viewOverrides } = overrides;
  const [roles, channels] = await Promise.all([loadSortedRoles(), discord.getGuildTextChannels()]);
  res.status(status || 200).render('settings', {
    active: 'settings',
    roles,
    channels,
    access: store.readAccess(),
    saved: false,
    error: null,
    ...viewOverrides,
  });
}

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await renderSettings(req, res, { saved: req.query.saved === '1', leaderboardSent: req.query.leaderboardSent === '1' });
  } catch (err) {
    next(err);
  }
});

router.post('/roles', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const allowedRoleIds = [].concat(req.body.allowedRoleIds || []);
    const adminRoleIds = [].concat(req.body.adminRoleIds || []);
    const memberRoleIds = [].concat(req.body.memberRoleIds || []);
    const recruitRankRoleId = req.body.recruitRankRoleId || null;
    const memberRankRoleId = req.body.memberRankRoleId || null;

    // Refuse changes that would strip the acting admin of their own admin access.
    const keepsSelfAdmin = req.session.user.roles.some((roleId) => adminRoleIds.includes(roleId));
    if (!keepsSelfAdmin) {
      return await renderSettings(req, res, {
        status: 400,
        error: "That change would remove your own admin access, so it wasn't saved. Keep one of your roles checked under Admin Access Roles.",
      });
    }

    const currentAccess = store.readAccess();
    const leaderboardChannelId = req.body.leaderboardChannelId || null;
    const cashTotalChannelId = req.body.cashTotalChannelId || null;
    store.writeAccess({
      ...currentAccess, adminRoleIds, allowedRoleIds, memberRoleIds, recruitRankRoleId, memberRankRoleId,
      leaderboardChannelId,
      cashTotalChannelId,
      // A message in a different channel cannot be edited; require one manual Send there.
      leaderboardMessageId: currentAccess.leaderboardChannelId === leaderboardChannelId ? currentAccess.leaderboardMessageId : null,
    });
    res.redirect('/settings?saved=1');
  } catch (err) {
    next(err);
  }
});

router.post('/leaderboard/send', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await leaderboard.sendLeaderboard();
    res.redirect('/settings?leaderboardSent=1');
  } catch (err) {
    try {
      await renderSettings(req, res, { status: 400, error: err.message });
    } catch (renderError) { next(renderError); }
  }
});

module.exports = router;

