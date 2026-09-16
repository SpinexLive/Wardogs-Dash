const express = require('express');
const rcon = require('../lib/rcon');
const roster = require('../lib/roster');
const { getDashboardMetrics } = require('../lib/dashboardMetrics');
const { requireAuth, requireDashboardAccess, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const dashboard = await getDashboardMetrics();
    res.render('dashboard', {
      dashboard,
      active: 'dashboard',
      vipSuccess: req.query.vipSuccess || null,
      vipError: req.query.vipError || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/update-vip', requireAuth, requireAdmin, async (req, res) => {
  if (!rcon.isConfigured()) {
    return res.redirect(
      `/dashboard?vipError=${encodeURIComponent('RCON is not configured. Set RCON_HOST/RCON_PORT/RCON_PASSWORD in .env.')}`
    );
  }

  try {
    const { steamIds, skipped, configured } = await roster.getVipTargetSteamIds();
    if (!configured) {
      return res.redirect(
        `/dashboard?vipError=${encodeURIComponent('Set a Member Role in Settings before updating VIP.')}`
      );
    }

    await rcon.setReservedSlots(steamIds);

    let message = `Updated VIP for ${steamIds.length} member(s).`;
    if (skipped) message += ` Skipped ${skipped} without a Steam ID set.`;
    res.redirect(`/dashboard?vipSuccess=${encodeURIComponent(message)}`);
  } catch (err) {
    res.redirect(`/dashboard?vipError=${encodeURIComponent(err.message || 'Failed to update VIP.')}`);
  }
});

module.exports = router;
