const rcon = require('./rcon');
const rosterDb = require('./rosterDb');
const leaderboard = require('./leaderboard');
const cashCounter = require('./cashCounter');

const POLL_INTERVAL_MS = 60 * 1000;
let polling = false;
let timer = null;

async function pollCash() {
  if (polling || !rcon.isConfigured()) return;
  polling = true;
  try {
    const players = await rcon.getPlayers();
    rosterDb.recordCashSnapshot(players);
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
