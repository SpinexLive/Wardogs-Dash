const rcon = require('./rcon');
const store = require('./store');

const POLL_INTERVAL_MS = 5000;
const TEAM_SIZE_LIMIT = 50;
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
    const counts = new Map([[config.allowedFactionOne, 0], [config.allowedFactionTwo, 0]]);
    players.forEach((player) => { if (counts.has(player.faction)) counts.set(player.faction, counts.get(player.faction) + 1); });
    const targetFaction = () => [config.allowedFactionOne, config.allowedFactionTwo]
      .filter((faction) => counts.get(faction) < TEAM_SIZE_LIMIT)
      .sort((left, right) => counts.get(left) - counts.get(right))[0] || null;
    for (const player of players.filter((item) => item.faction === config.blockedFaction && item.steamId)) {
      const target = targetFaction();
      if (!target) break;
      await rcon.setPlayerFaction(player.steamId, target);
      counts.set(target, counts.get(target) + 1);
      player.faction = target;
      console.info(`[team-enforcement] moved ${player.name || player.steamId} from ${config.blockedFaction} to ${target}`);
    }
    for (const source of [config.allowedFactionOne, config.allowedFactionTwo]) {
      const destination = source === config.allowedFactionOne ? config.allowedFactionTwo : config.allowedFactionOne;
      for (const player of players.filter((item) => item.faction === source && item.steamId)) {
        if (counts.get(source) <= TEAM_SIZE_LIMIT || counts.get(destination) >= TEAM_SIZE_LIMIT) break;
        await rcon.setPlayerFaction(player.steamId, destination);
        counts.set(source, counts.get(source) - 1);
        counts.set(destination, counts.get(destination) + 1);
        player.faction = destination;
        console.info(`[team-enforcement] moved ${player.name || player.steamId} from ${source} to ${destination} (50-player limit)`);
      }
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
