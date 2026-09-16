const rcon = require('./rcon');
const rosterDb = require('./rosterDb');

const POLL_INTERVAL_MS = 60 * 1000;
let polling = false;
let timer = null;

async function pollCash() {
  if (polling || !rcon.isConfigured()) return;
  polling = true;
  try {
    rosterDb.recordCashSnapshot(await rcon.getPlayers());
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
