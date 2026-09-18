const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'access.json');

// Creates the access store on first run, seeded from ADMIN_ROLE_IDS.
function ensureStore(defaultAdminRoleIds) {
  if (fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  writeAccess({
    adminRoleIds: defaultAdminRoleIds,
    allowedRoleIds: [],
    memberRoleIds: [],
    recruitRankRoleId: null,
    memberRankRoleId: null,
    leaderboardChannelId: null,
    leaderboardMessageId: null,
    cashTotalChannelId: null,
    cashTotalLastName: null,
    cashTotalNextUpdateAt: null,
    rosterChannelId: null,
    rosterEmojiMap: {},
    teamEnforcement: { enabled: false, allowedFactionOne: null, allowedFactionTwo: null, blockedFaction: null },
  });
}

function readAccess() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);
  // Newer fields are defaulted here for stores created before they were added.
  return {
    adminRoleIds: [],
    allowedRoleIds: [],
    memberRoleIds: [],
    recruitRankRoleId: null,
    memberRankRoleId: null,
    leaderboardChannelId: null,
    leaderboardMessageId: null,
    cashTotalChannelId: null,
    cashTotalLastName: null,
    cashTotalNextUpdateAt: null,
    rosterChannelId: null,
    rosterEmojiMap: {},
    teamEnforcement: { enabled: false, allowedFactionOne: null, allowedFactionTwo: null, blockedFaction: null },
    ...data,
  };
}

function writeAccess(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = { ensureStore, readAccess, writeAccess };
