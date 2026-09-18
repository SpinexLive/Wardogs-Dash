const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'data', 'wardogs.db'));
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS bounties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL CHECK(status IN ('active', 'claimed', 'cancelled')) DEFAULT 'active',
    target_steam_id TEXT NOT NULL, target_name TEXT NOT NULL, target_faction TEXT,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_by TEXT,
    claimed_at TEXT, killer_steam_id TEXT, killer_name TEXT, killer_faction TEXT,
    cause TEXT, kill_event_id TEXT UNIQUE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_active_bounty ON bounties(status) WHERE status = 'active';
  CREATE TABLE IF NOT EXISTS bounty_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, bounty_id INTEGER NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, body TEXT NOT NULL, server_sent_at TEXT, discord_message_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS bounty_feed_events (
    bounty_id INTEGER NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL, PRIMARY KEY (bounty_id, event_id)
  );
  CREATE TABLE IF NOT EXISTS priority_access_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT, bounty_id INTEGER NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    steam_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS priority_access_active_idx ON priority_access_rewards(steam_id, expires_at) WHERE revoked_at IS NULL;
`);

function getActiveBounty() { return db.prepare("SELECT * FROM bounties WHERE status = 'active' LIMIT 1").get() || null; }
function getRecentBounties(limit = 12) { return db.prepare('SELECT b.*, rewards.expires_at AS reward_expires_at FROM bounties AS b LEFT JOIN priority_access_rewards AS rewards ON rewards.bounty_id = b.id ORDER BY b.id DESC LIMIT ?').all(limit); }
function startBounty(target, startedBy) {
  const result = db.prepare('INSERT INTO bounties (target_steam_id, target_name, target_faction, started_by) VALUES (?, ?, ?, ?)').run(target.steamId, target.name, target.faction || null, startedBy || null);
  return db.prepare('SELECT * FROM bounties WHERE id = ?').get(result.lastInsertRowid);
}
function cancelBounty(id) { return db.prepare("UPDATE bounties SET status = 'cancelled' WHERE id = ? AND status = 'active'").run(id).changes > 0; }
function hasSeenFeedEvent(bountyId, eventId) { return Boolean(db.prepare('SELECT 1 FROM bounty_feed_events WHERE bounty_id = ? AND event_id = ?').get(bountyId, eventId)); }
function rememberFeedEvent(bountyId, eventId) { db.prepare('INSERT OR IGNORE INTO bounty_feed_events (bounty_id, event_id) VALUES (?, ?)').run(bountyId, eventId); }
function addMessage(bountyId, kind, body, sent = false) { db.prepare('INSERT INTO bounty_messages (bounty_id, kind, body, server_sent_at) VALUES (?, ?, ?, ?)').run(bountyId, kind, body, sent ? new Date().toISOString() : null); }
const claimBounty = db.transaction((bountyId, kill, message, grantPriority = true) => {
  const result = db.prepare("UPDATE bounties SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP, killer_steam_id = ?, killer_name = ?, killer_faction = ?, cause = ?, kill_event_id = ? WHERE id = ? AND status = 'active'").run(kill.killer.steamId, kill.killer.name, kill.killer.faction || null, kill.cause || null, kill.eventId, bountyId);
  if (!result.changes) return null;
  let reward = null;
  if (grantPriority) {
    const result = db.prepare("INSERT INTO priority_access_rewards (bounty_id, steam_id, expires_at) VALUES (?, ?, datetime('now', '+3 days'))").run(bountyId, kill.killer.steamId);
    reward = db.prepare('SELECT * FROM priority_access_rewards WHERE id = ?').get(result.lastInsertRowid);
  }
  db.prepare('INSERT INTO bounty_messages (bounty_id, kind, body, server_sent_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(bountyId, 'claimed', message);
  return { claimed: true, reward };
});
function activePrioritySteamIds() { return db.prepare("SELECT DISTINCT steam_id FROM priority_access_rewards WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP").all().map((row) => row.steam_id); }
function expirePriorityRewards() { return db.prepare("UPDATE priority_access_rewards SET revoked_at = CURRENT_TIMESTAMP WHERE revoked_at IS NULL AND expires_at <= CURRENT_TIMESTAMP").run().changes; }

module.exports = { getActiveBounty, getRecentBounties, startBounty, cancelBounty, hasSeenFeedEvent, rememberFeedEvent, addMessage, claimBounty, activePrioritySteamIds, expirePriorityRewards };
