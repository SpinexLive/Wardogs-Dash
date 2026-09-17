const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'wardogs.db'));
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS rosters (event_id TEXT PRIMARY KEY, event_name TEXT NOT NULL, event_start INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS squads (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES rosters(event_id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, template TEXT NOT NULL, leader_slots INTEGER NOT NULL DEFAULT 0, player_slots INTEGER NOT NULL DEFAULT 0, fixed_slots INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS roster_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, squad_id INTEGER NOT NULL REFERENCES squads(id) ON DELETE CASCADE, player_id TEXT NOT NULL, player_name TEXT NOT NULL, player_role TEXT NOT NULL, position INTEGER NOT NULL, UNIQUE(squad_id, position), UNIQUE(squad_id, player_id));
  CREATE TABLE IF NOT EXISTS player_cash_tracking (
    steam_id TEXT PRIMARY KEY, current_cash REAL NOT NULL DEFAULT 0, earned_cash REAL NOT NULL DEFAULT 0,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS match_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_map TEXT,
    experiences TEXT,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    last_match_seconds INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS match_player_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,
    steam_id TEXT NOT NULL,
    total_kills INTEGER NOT NULL DEFAULT 0,
    total_deaths INTEGER NOT NULL DEFAULT 0,
    last_kills INTEGER NOT NULL DEFAULT 0,
    last_deaths INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, steam_id)
  );
  CREATE INDEX IF NOT EXISTS idx_match_player_stats_steam_id ON match_player_stats(steam_id);
  CREATE TABLE IF NOT EXISTS roster_discord_messages (
    event_id TEXT PRIMARY KEY REFERENCES rosters(event_id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS roster_discord_reminders (
    event_id TEXT PRIMARY KEY REFERENCES rosters(event_id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS roster_confirmations (
    event_id TEXT NOT NULL REFERENCES rosters(event_id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'declined')) DEFAULT 'pending',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(event_id, player_id)
  );
`);

function getRoster(eventId) {
  const roster = db.prepare('SELECT * FROM rosters WHERE event_id = ?').get(eventId);
  if (!roster) return null;
  roster.squads = db.prepare('SELECT * FROM squads WHERE event_id = ? ORDER BY position').all(eventId).map((squad) => ({ ...squad, assignments: db.prepare('SELECT * FROM roster_assignments WHERE squad_id = ? ORDER BY position').all(squad.id) }));
  return roster;
}
function getRosterDiscordMessage(eventId) { return db.prepare('SELECT * FROM roster_discord_messages WHERE event_id = ?').get(eventId) || null; }
function setRosterDiscordMessage(eventId, channelId, messageId) { db.prepare('INSERT INTO roster_discord_messages (event_id, channel_id, message_id) VALUES (?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id').run(eventId, channelId, messageId); }
function getRosterDiscordReminder(eventId) { return db.prepare('SELECT * FROM roster_discord_reminders WHERE event_id = ?').get(eventId) || null; }
function setRosterDiscordReminder(eventId, channelId, messageId) { db.prepare('INSERT INTO roster_discord_reminders (event_id, channel_id, message_id) VALUES (?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id').run(eventId, channelId, messageId); }
function getRosterConfirmations(eventId) {
  return new Map(db.prepare('SELECT player_id, status FROM roster_confirmations WHERE event_id = ?').all(eventId).map((row) => [row.player_id, row.status]));
}
function setRosterConfirmation(eventId, playerId, status) { db.prepare("INSERT INTO roster_confirmations (event_id, player_id, status) VALUES (?, ?, ?) ON CONFLICT(event_id, player_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP").run(eventId, playerId, status); }
function hasRoster(eventId) { return Boolean(db.prepare('SELECT 1 FROM rosters WHERE event_id = ?').get(eventId)); }
function deleteRoster(eventId) { db.prepare('DELETE FROM rosters WHERE event_id = ?').run(eventId); }
const saveRoster = db.transaction((event, squads) => {
  const totalSlots = squads.reduce((total, squad) => total + Number(squad.leaderSlots || 0) + Number(squad.playerSlots || 0) + Number(squad.fixedSlots || 0), 0);
  const assigned = squads.reduce((total, squad) => total + (squad.assignments || []).length, 0);
  if (totalSlots > 33 || assigned > 33) throw new Error('A roster cannot exceed 33 player slots.');
  const ids = squads.flatMap((squad) => (squad.assignments || []).map((player) => player.id));
  if (new Set(ids).size !== ids.length) throw new Error('A player can only be assigned once.');
  const previousPositions = new Map(db.prepare(`SELECT assignments.player_id, squads.position AS squad_position, squads.template, assignments.position AS slot_position FROM roster_assignments AS assignments INNER JOIN squads ON squads.id = assignments.squad_id WHERE squads.event_id = ?`).all(event.id).map((row) => [row.player_id, `${row.template}:${row.squad_position}:${row.slot_position}`]));
  const resetConfirmation = db.prepare("INSERT INTO roster_confirmations (event_id, player_id, status) VALUES (?, ?, 'pending') ON CONFLICT(event_id, player_id) DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP");
  const resetConfirmations = [];
  squads.forEach((squad, squadPosition) => (squad.assignments || []).forEach((player, playerPosition) => {
    const slotPosition = Number.isInteger(player.slot) ? player.slot : playerPosition;
    const previous = previousPositions.get(player.id);
    if (previous && previous !== `${squad.template}:${squadPosition}:${slotPosition}`) {
      resetConfirmation.run(event.id, player.id);
      resetConfirmations.push(player.id);
    }
  }));
  db.prepare('INSERT INTO rosters (event_id, event_name, event_start) VALUES (?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET event_name = excluded.event_name, event_start = excluded.event_start, updated_at = CURRENT_TIMESTAMP').run(event.id, event.name, event.startTime || null);
  db.prepare('DELETE FROM squads WHERE event_id = ?').run(event.id);
  const addSquad = db.prepare('INSERT INTO squads (event_id, position, name, template, leader_slots, player_slots, fixed_slots) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const addPlayer = db.prepare('INSERT INTO roster_assignments (squad_id, player_id, player_name, player_role, position) VALUES (?, ?, ?, ?, ?)');
  squads.forEach((squad, position) => { const result = addSquad.run(event.id, position, squad.name, squad.template, squad.leaderSlots || 0, squad.playerSlots || 0, squad.fixedSlots || 0); (squad.assignments || []).forEach((player, playerPosition) => addPlayer.run(result.lastInsertRowid, player.id, player.name, player.role, Number.isInteger(player.slot) ? player.slot : playerPosition)); });
  return resetConfirmations;
});
const recordCashSnapshot = db.transaction((players) => {
  const find = db.prepare('SELECT current_cash FROM player_cash_tracking WHERE steam_id = ?');
  const insert = db.prepare('INSERT INTO player_cash_tracking (steam_id, current_cash, earned_cash, last_seen_at) VALUES (?, ?, 0, CURRENT_TIMESTAMP)');
  const update = db.prepare('UPDATE player_cash_tracking SET current_cash = ?, earned_cash = earned_cash + ?, last_seen_at = CURRENT_TIMESTAMP WHERE steam_id = ?');
  players.forEach((player) => {
    if (!player?.steamId || !Number.isFinite(Number(player.cash))) return;
    const steamId = String(player.steamId);
    const cash = Number(player.cash);
    const existing = find.get(steamId);
    if (!existing) insert.run(steamId, cash);
    else update.run(cash, Math.max(0, cash - Number(existing.current_cash)), steamId);
  });
});
function getCommunityCashTotal() { return Number(db.prepare('SELECT COALESCE(SUM(earned_cash), 0) AS total FROM player_cash_tracking').get().total); }
function getCashTotals(steamIds) {
  if (!steamIds.length) return new Map();
  const rows = db.prepare(`SELECT steam_id, earned_cash FROM player_cash_tracking WHERE steam_id IN (${steamIds.map(() => '?').join(',')})`).all(...steamIds.map(String));
  return new Map(rows.map((row) => [row.steam_id, Number(row.earned_cash)]));
}

// A session is a complete server match. A new session begins when the map/experience
// changes or the server's match clock resets. The first observation is a baseline so
// existing mid-match scoreboard values are never counted twice.
const recordMatchSnapshot = db.transaction((status, players) => {
  const rawMap = status?.map || status?.mapName || null;
  const map = typeof rawMap === 'string' || rawMap === null ? rawMap : JSON.stringify(rawMap);
  const experiences = JSON.stringify(status?.experiences || []);
  const matchSeconds = Math.max(0, Number(status?.matchSeconds) || 0);
  let session = db.prepare('SELECT * FROM match_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1').get();
  const isNewMatch = session && (
    session.server_map !== map ||
    session.experiences !== experiences ||
    matchSeconds < Number(session.last_match_seconds)
  );

  if (isNewMatch) {
    db.prepare("UPDATE match_sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
    session = null;
  }
  if (!session) {
    const result = db.prepare('INSERT INTO match_sessions (server_map, experiences, last_match_seconds) VALUES (?, ?, ?)').run(map, experiences, matchSeconds);
    session = { id: result.lastInsertRowid };
  } else {
    db.prepare('UPDATE match_sessions SET server_map = ?, experiences = ?, last_match_seconds = ? WHERE id = ?').run(map, experiences, matchSeconds, session.id);
  }

  const find = db.prepare('SELECT * FROM match_player_stats WHERE session_id = ? AND steam_id = ?');
  const insert = db.prepare('INSERT INTO match_player_stats (session_id, steam_id, last_kills, last_deaths) VALUES (?, ?, ?, ?)');
  const update = db.prepare('UPDATE match_player_stats SET total_kills = total_kills + ?, total_deaths = total_deaths + ?, last_kills = ?, last_deaths = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?');
  (players || []).forEach((player) => {
    if (!player?.steamId) return;
    const kills = Math.max(0, Number(player.kills) || 0);
    const deaths = Math.max(0, Number(player.deaths) || 0);
    const existing = find.get(session.id, String(player.steamId));
    if (!existing) insert.run(session.id, String(player.steamId), kills, deaths);
    else update.run(Math.max(0, kills - existing.last_kills), Math.max(0, deaths - existing.last_deaths), kills, deaths, existing.id);
  });
});

function getMatchStats(steamIds) {
  if (!steamIds.length) return new Map();
  const placeholders = steamIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT stats.steam_id, SUM(stats.total_kills) AS total_kills,
      COUNT(CASE WHEN sessions.ended_at IS NOT NULL THEN 1 END) AS sessions,
      AVG(CASE WHEN sessions.ended_at IS NOT NULL THEN stats.total_kills END) AS avg_kills,
      AVG(CASE WHEN sessions.ended_at IS NOT NULL THEN stats.total_deaths END) AS avg_deaths,
      AVG(CASE WHEN sessions.ended_at IS NOT NULL THEN CASE WHEN stats.total_deaths = 0 THEN stats.total_kills ELSE CAST(stats.total_kills AS REAL) / stats.total_deaths END END) AS avg_kd
    FROM match_player_stats AS stats
    INNER JOIN match_sessions AS sessions ON sessions.id = stats.session_id
    WHERE stats.steam_id IN (${placeholders}) GROUP BY stats.steam_id
  `).all(...steamIds.map(String));
  return new Map(rows.map((row) => [row.steam_id, {
    totalKills: Number(row.total_kills), sessions: Number(row.sessions), avgKills: row.avg_kills === null ? null : Number(row.avg_kills),
    avgDeaths: row.avg_deaths === null ? null : Number(row.avg_deaths), avgKd: row.avg_kd === null ? null : Number(row.avg_kd),
  }]));
}

module.exports = { getRoster, hasRoster, saveRoster, deleteRoster, getRosterDiscordMessage, setRosterDiscordMessage, getRosterDiscordReminder, setRosterDiscordReminder, getRosterConfirmations, setRosterConfirmation, recordCashSnapshot, recordMatchSnapshot, getCommunityCashTotal, getCashTotals, getMatchStats };
