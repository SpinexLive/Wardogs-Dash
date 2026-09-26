const express = require('express');
const rosterDb = require('../lib/rosterDb');
const discord = require('../lib/discord');
const { requireAuth, requireDashboardAccess } = require('../middleware/auth');

const router = express.Router();
const ATTENDANCE_CHANNEL_ID = '1546197103498363031';

function isUpcoming(roster) {
  const graceSeconds = 3 * 60 * 60;
  return roster && Number(roster.event_start) > Math.floor(Date.now() / 1000) - graceSeconds;
}

async function getVoiceChannelAttendance(playerIds) {
  const present = new Set();
  const errors = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, playerIds.length) }, async () => {
    while (cursor < playerIds.length) {
      const playerId = playerIds[cursor++];
      try {
        const state = await discord.getGuildVoiceState(playerId);
        if (state?.channel_id === ATTENDANCE_CHANNEL_ID) present.add(playerId);
      } catch (err) { errors.push(err); }
    }
  });
  await Promise.all(workers);
  return { present, error: errors.length ? 'Discord channel attendance could not be fully checked.' : null };
}

router.get('/', requireAuth, requireDashboardAccess, (req, res) => {
  res.render('briefing', { active: 'briefing', rosters: rosterDb.getUpcomingRosters(), error: null });
});

router.get('/:eventId', requireAuth, requireDashboardAccess, (req, res) => {
  const roster = rosterDb.getRoster(req.params.eventId);
  if (!isUpcoming(roster)) return res.status(404).render('error', { message: 'This briefing is unavailable because its roster is missing or the match has already started.' });
  res.render('briefing-roster', { active: 'briefing', roster, attendanceChannelId: ATTENDANCE_CHANNEL_ID, error: null });
});

router.post('/:eventId/check-attendance', requireAuth, requireDashboardAccess, async (req, res, next) => {
  try {
    const roster = rosterDb.getRoster(req.params.eventId);
    if (!isUpcoming(roster)) return res.status(404).json({ error: 'This upcoming saved roster was not found.' });

    const assignments = roster.squads.flatMap((squad) => squad.assignments);
    const playerIds = [...new Set(assignments.map((player) => String(player.player_id)))];
    const voice = await getVoiceChannelAttendance(playerIds);
    const attendance = Object.fromEntries(playerIds.map((playerId) => [playerId, {
      discord: voice.present.has(playerId),
    }]));
    res.json({ attendance, warnings: [voice.error].filter(Boolean) });
  } catch (err) { next(err); }
});

module.exports = router;
