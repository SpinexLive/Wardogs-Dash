const rcon = require('./rcon');
const rosterDb = require('./rosterDb');
const leaderboard = require('./leaderboard');
const cashCounter = require('./cashCounter');
const warcon = require('./warcon');

const POLL_INTERVAL_MS = 60 * 1000;
let polling = false;
let timer = null;

function oldestTimestamp(kills) {
  return (kills || []).map((kill) => kill?.ts).filter(Boolean).sort()[0] || null;
}

async function trackHeadshots() {
  if (!warcon.isConfigured()) return;
  const recentKills = await warcon.getKills({ limit: 200 });
  rosterDb.recordHeadshotKills(recentKills);

  const history = rosterDb.getHeadshotHistoryState();
  if (history.completed_at) return;
  if (!history.cursor) {
    const cursor = oldestTimestamp(recentKills);
    if (cursor) rosterDb.updateHeadshotHistoryState(cursor);
    return;
  }

  const olderKills = await warcon.getKills({ limit: 200, before: history.cursor });
  rosterDb.recordHeadshotKills(olderKills);
  const cursor = oldestTimestamp(olderKills);
  rosterDb.updateHeadshotHistoryState(cursor || history.cursor, !cursor || cursor === history.cursor);
}

async function pollCash() {
  if (polling || !rcon.isConfigured()) return;
  polling = true;
  try {
    const players = await rcon.getPlayers();
    rosterDb.recordCashSnapshot(players);
    await trackHeadshots().catch((err) => console.warn(`[headshot-tracker] ${err.message}`));
    await cashCounter.updateCashTotalChannel().catch((err) => console.warn(`[cash-counter] ${err.message}`));
    // The Discord message is only edited after an admin has explicitly sent it once.
    await leaderboard.updateLeaderboard().catch((err) => console.warn(`[leaderboard] ${err.message}`));
  } catch (err) {
    // Server availability is transient; the next scheduled poll will retry.
    console.warn(`[cash-tracker] ${err.message}`);
  } finally {
    polling = false;
  }
}

function startCashTracking() {
  if (timer || !rcon.isConfigured()) return;
  pollCash();
  timer = setInterval(pollCash, POLL_INTERVAL_MS);
  timer.unref();
}

module.exports = { startCashTracking, pollCash };
