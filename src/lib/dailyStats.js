const wardogs = require('./wardogs');
const snapshots = require('./statsSnapshot');
const steamStore = require('./steamStore');
let timer;
let running = false;

function nextRefresh(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function refresh(now = new Date()) {
  if (running || !wardogs.isConfigured()) return;
  const date = now.toISOString().slice(0, 10);
  if (snapshots.read().lastAttemptDate === date) return;
  running = true;
  try {
    // Persist the attempt before calling the API so restarts cannot repeat it.
    snapshots.write({ ...snapshots.read(), lastAttemptDate: date });
    const players = await wardogs.refreshPlayerSummaries(Object.values(steamStore.readSteamIds()));
    snapshots.write({ players, updatedAt: new Date().toISOString(), lastAttemptDate: date });
    console.info(`[wardogs] Daily stats saved for ${Object.keys(players).length} players.`);
  } catch (error) {
    // Retain the last complete snapshot; retry at the next day's scheduled run.
    console.warn(`[wardogs] Daily stats refresh failed: ${error.message}`);
  } finally { running = false; }
}

function startDailyStats() {
  if (timer) return;
  const schedule = () => {
    timer = setTimeout(async () => {
      await refresh();
      schedule();
    }, nextRefresh().getTime() - Date.now());
    timer.unref();
  };
  schedule();
}

module.exports = { startDailyStats, nextRefresh, refresh };
