const bountyDb = require('./bountyDb');
const warcon = require('./warcon');
const rcon = require('./rcon');
const { grantPriorityAccess } = require('./priorityAccess');

const POLL_INTERVAL_MS = 2500;
let timer = null;
let polling = false;

function weaponName(cause) {
  return String(cause || 'unknown weapon').replace(/^Id\.(Item|Vehicle)\./, '').replace(/[._]/g, ' ');
}

async function pollBountyHunter() {
  const bounty = bountyDb.getActiveBounty();
  if (polling || !bounty || !warcon.isConfigured()) return;
  polling = true;
  try {
    const kills = await warcon.getKills({ victim: bounty.target_steam_id, limit: 20 });
    for (const kill of kills.reverse()) {
      if (!kill?.eventId || bountyDb.hasSeenFeedEvent(bounty.id, kill.eventId)) continue;
      bountyDb.rememberFeedEvent(bounty.id, kill.eventId);
      const killedAfterStart = new Date(kill.ts || 0).getTime() >= new Date(bounty.started_at).getTime();
      if (!killedAfterStart || !kill.killer?.steamId || kill.suicide) continue;
      const killerFaction = kill.killer.faction || 'Unknown faction';
      const reservedSlots = new Set((await rcon.getReservedSlots()).map(String));
      const alreadyHasPriority = reservedSlots.has(String(kill.killer.steamId));
      const message = alreadyHasPriority
        ? `BOUNTY CLAIMED: ${kill.killer.name} of ${killerFaction} eliminated ${bounty.target_name} with ${weaponName(kill.cause)}.`
        : `BOUNTY CLAIMED: ${kill.killer.name} of ${killerFaction} eliminated ${bounty.target_name} with ${weaponName(kill.cause)}. ${kill.killer.name} has earned 3 days Priority Access to our server.`;
      const claim = bountyDb.claimBounty(bounty.id, kill, message, !alreadyHasPriority);
      if (!claim) return;
      if (claim.reward) await grantPriorityAccess(kill.killer.steamId);
      await rcon.broadcast(message);
      console.info(`[bounty-hunter] bounty ${bounty.id} claimed by ${kill.killer.steamId}`);
      return;
    }
  } catch (err) {
    console.warn(`[bounty-hunter] ${err.message}`);
  } finally {
    polling = false;
  }
}

function startBountyHunter() {
  if (timer) return;
  timer = setInterval(pollBountyHunter, POLL_INTERVAL_MS);
  timer.unref();
}

module.exports = { startBountyHunter, pollBountyHunter };
