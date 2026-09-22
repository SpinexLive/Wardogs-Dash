const bountyDb = require('./bountyDb');
const rcon = require('./rcon');

const EXPIRY_CHECK_MS = 15 * 60 * 1000;
let timer = null;

async function grantPriorityAccess(steamId) {
  if (!rcon.isConfigured()) return;
  await rcon.addReservedSlot(String(steamId));
}

function startPriorityAccessExpiry() {
  if (timer) return;
  timer = setInterval(() => {
    if (!rcon.isConfigured()) return;
    const expiredSteamIds = bountyDb.expirePriorityRewards();
    Promise.all(expiredSteamIds.map((steamId) => rcon.removeReservedSlot(steamId)))
      .catch((err) => console.warn(`[priority-access] ${err.message}`));
  }, EXPIRY_CHECK_MS);
  timer.unref();
}

module.exports = { grantPriorityAccess, startPriorityAccessExpiry };
