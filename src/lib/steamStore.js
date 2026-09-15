const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'steam-ids.json');

// Maps Discord user ID -> Steam ID.
function ensureStore() {
  if (fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  writeSteamIds({});
}

function readSteamIds() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeSteamIds(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = { ensureStore, readSteamIds, writeSteamIds };
