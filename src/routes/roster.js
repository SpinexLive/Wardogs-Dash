const express = require('express');
const { getRosterEvents, getRosterEvent } = require('../lib/raidHelper');
const rosterDb = require('../lib/rosterDb');
const steamStore = require('../lib/steamStore');
const warcon = require('../lib/warcon');
const { publishRoster, sendPendingReminder } = require('../lib/rosterDiscord');
const { requireAuth, requireDashboardAccess, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const events = await getRosterEvents();
    res.render('roster', { active: 'roster', events: events.map((event) => ({ ...event, hasRoster: rosterDb.hasRoster(event.id) })), error: null });
  } catch (err) { next(err); }
});
router.get('/:eventId', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const event = await getRosterEvent(req.params.eventId);
    const steamIds = steamStore.readSteamIds();
    const confirmations = rosterDb.getRosterConfirmations(req.params.eventId);
    let performance = new Map();
    if (warcon.isConfigured()) {
      try {
        performance = await warcon.getPlayerSummaries(event.players.map((player) => steamIds[player.id]).filter(Boolean));
      } catch (_) {
        // Roster construction remains available if Warcon is temporarily unavailable.
      }
    }
    event.players = event.players.map((player) => {
      const stats = performance.get(String(steamIds[player.id] || ''));
      return {
        ...player,
        confirmation: confirmations.get(player.id) || 'pending',
        performance: stats ? { kd: stats.kd.toFixed(2), kpm: stats.kpm.toFixed(2) } : null,
      };
    });
    event.discordPosted = Boolean(rosterDb.getRosterDiscordMessage(req.params.eventId));
    res.render('roster-builder', { active: 'roster', event, savedRoster: rosterDb.getRoster(req.params.eventId), error: null });
  } catch (err) { next(err); }
});
router.post('/:eventId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { event, squads } = req.body || {};
    if (!event || String(event.id) !== req.params.eventId || !Array.isArray(squads)) return res.status(400).json({ error: 'Invalid roster payload.' });
    res.json({ ok: true, resetConfirmations: rosterDb.saveRoster(event, squads) });
  } catch (err) { next(err); }
});
router.post('/:eventId/share', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const event = await getRosterEvent(req.params.eventId);
    await publishRoster(req.params.eventId, event.channelId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
router.post('/:eventId/remind-pending', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const event = await getRosterEvent(req.params.eventId);
    await sendPendingReminder(req.params.eventId, event.channelId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
module.exports = router;
