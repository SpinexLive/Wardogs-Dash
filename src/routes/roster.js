const express = require('express');
const { getRosterEvents, getRosterEvent } = require('../lib/raidHelper');
const rosterDb = require('../lib/rosterDb');
const { requireAuth, requireDashboardAccess, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const events = await getRosterEvents();
    res.render('roster', { active: 'roster', events: events.map((event) => ({ ...event, hasRoster: rosterDb.hasRoster(event.id) })), error: null });
  } catch (err) { next(err); }
});
router.get('/:eventId', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try { res.render('roster-builder', { active: 'roster', event: await getRosterEvent(req.params.eventId), savedRoster: rosterDb.getRoster(req.params.eventId), error: null }); } catch (err) { next(err); }
});
router.post('/:eventId', requireAuth, requireAdmin, (req, res, next) => {
  try {
    const { event, squads } = req.body || {};
    if (!event || String(event.id) !== req.params.eventId || !Array.isArray(squads)) return res.status(400).json({ error: 'Invalid roster payload.' });
    rosterDb.saveRoster(event, squads);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
module.exports = router;
