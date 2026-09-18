const bountyDb = require('./bountyDb');
const roster = require('./roster');
const rcon = require('./rcon');

const EXPIRY_CHECK_MS = 15 * 60 * 1000;
let timer = null;

async function syncReservedSlots(baseSteamIds = null) {
  if (!rcon.isConfigured()) return;
  const base = baseSteamIds || (await roster.getVipTargetSteamIds()).steamIds;
  bountyDb.expirePriorityRewards();
  const target = [...new Set([...base.map(String), ...bountyDb.activePrioritySteamIds().map(String)])];
  await rcon.setReservedSlots(target);
  return target;
}

function startPriorityAccessExpiry() {
  if (timer) return;
  timer = setInterval(() => {
    syncReservedSlots().catch((err) => console.warn(`[priority-access] ${err.message}`));
  }, EXPIRY_CHECK_MS);
  timer.unref();
}

module.exports = { syncReservedSlots, startPriorityAccessExpiry };
