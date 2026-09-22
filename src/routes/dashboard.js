const express = require('express');
const { getDashboardMetrics } = require('../lib/dashboardMetrics');
const { requireAuth, requireDashboardAccess } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const dashboard = await getDashboardMetrics();
    res.render('dashboard', {
      dashboard,
      active: 'dashboard',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
