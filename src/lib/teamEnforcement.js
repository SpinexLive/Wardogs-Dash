const rcon = require('./rcon');
const store = require('./store');

const POLL_INTERVAL_MS = 5000;
let timer = null;
let polling = false;

function settings() {
  return store.readAccess().teamEnforcement || {};
}

async function pollTeamEnforcement() {
  const config = settings();
  if (polling || !config.enabled || !rcon.isConfigured()) return;
  if (!config.allowedFactionOne || !config.allowedFactionTwo || !config.blockedFaction) return;
  polling = true;
  try {
    const capabilities = await rcon.getCapabilities();
    if (!capabilities.routes?.includes('PATCH /v1/players/{id}')) return;
    const players = await rcon.getPlayers();
    const counts = new Map([
      [config.allowedFactionOne, players.filter((player) => player.faction === config.allowedFactionOne).length],
      [config.allowedFactionTwo, players.filter((player) => player.faction === config.allowedFactionTwo).length],
    ]);
    for (const player of players.filter((item) => item.faction === config.blockedFaction && item.steamId)) {
      const target = counts.get(config.allowedFactionOne) <= counts.get(config.allowedFactionTwo)
        ? config.allowedFactionOne : config.allowedFactionTwo;
      await rcon.setPlayerFaction(player.steamId, target);
      counts.set(target, counts.get(target) + 1);
      console.info(`[team-enforcement] moved ${player.name || player.steamId} from ${config.blockedFaction} to ${target}`);
    }
  } catch (err) {
    console.warn(`[team-enforcement] ${err.message}`);
  } finally {
    polling = false;
  }
}

function startTeamEnforcement() {
  if (timer) return;
  pollTeamEnforcement();
  timer = setInterval(pollTeamEnforcement, POLL_INTERVAL_MS);
  timer.unref();
}

module.exports = { startTeamEnforcement, pollTeamEnforcement };
