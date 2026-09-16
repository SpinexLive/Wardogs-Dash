const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'wardogs.db'));
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS rosters (event_id TEXT PRIMARY KEY, event_name TEXT NOT NULL, event_start INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS squads (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES rosters(event_id) ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, template TEXT NOT NULL, leader_slots INTEGER NOT NULL DEFAULT 0, player_slots INTEGER NOT NULL DEFAULT 0, fixed_slots INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS roster_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, squad_id INTEGER NOT NULL REFERENCES squads(id) ON DELETE CASCADE, player_id TEXT NOT NULL, player_name TEXT NOT NULL, player_role TEXT NOT NULL, position INTEGER NOT NULL, UNIQUE(squad_id, position), UNIQUE(squad_id, player_id));
`);

function getRoster(eventId) {
  const roster = db.prepare('SELECT * FROM rosters WHERE event_id = ?').get(eventId);
  if (!roster) return null;
  roster.squads = db.prepare('SELECT * FROM squads WHERE event_id = ? ORDER BY position').all(eventId).map((squad) => ({ ...squad, assignments: db.prepare('SELECT * FROM roster_assignments WHERE squad_id = ? ORDER BY position').all(squad.id) }));
  return roster;
}
function hasRoster(eventId) { return Boolean(db.prepare('SELECT 1 FROM rosters WHERE event_id = ?').get(eventId)); }
function deleteRoster(eventId) { db.prepare('DELETE FROM rosters WHERE event_id = ?').run(eventId); }
const saveRoster = db.transaction((event, squads) => {
  const totalSlots = squads.reduce((total, squad) => total + Number(squad.leaderSlots || 0) + Number(squad.playerSlots || 0) + Number(squad.fixedSlots || 0), 0);
  const assigned = squads.reduce((total, squad) => total + (squad.assignments || []).length, 0);
  if (totalSlots > 33 || assigned > 33) throw new Error('A roster cannot exceed 33 player slots.');
  const ids = squads.flatMap((squad) => (squad.assignments || []).map((player) => player.id));
  if (new Set(ids).size !== ids.length) throw new Error('A player can only be assigned once.');
  db.prepare('INSERT INTO rosters (event_id, event_name, event_start) VALUES (?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET event_name = excluded.event_name, event_start = excluded.event_start, updated_at = CURRENT_TIMESTAMP').run(event.id, event.name, event.startTime || null);
  db.prepare('DELETE FROM squads WHERE event_id = ?').run(event.id);
  const addSquad = db.prepare('INSERT INTO squads (event_id, position, name, template, leader_slots, player_slots, fixed_slots) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const addPlayer = db.prepare('INSERT INTO roster_assignments (squad_id, player_id, player_name, player_role, position) VALUES (?, ?, ?, ?, ?)');
  squads.forEach((squad, position) => { const result = addSquad.run(event.id, position, squad.name, squad.template, squad.leaderSlots || 0, squad.playerSlots || 0, squad.fixedSlots || 0); (squad.assignments || []).forEach((player, playerPosition) => addPlayer.run(result.lastInsertRowid, player.id, player.name, player.role, playerPosition)); });
});
module.exports = { getRoster, hasRoster, saveRoster, deleteRoster };
