const express = require('express');
const { getRosterEvents } = require('../lib/raidHelper');
const { requireAuth, requireDashboardAccess } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const roster = await getRosterEvents();
    res.render('roster', { active: 'roster', roster, error: null });
  } catch (err) {
    res.render('roster', { active: 'roster', roster: { configured: true, events: [] }, error: err.message });
  }
});

module.exports = router;
