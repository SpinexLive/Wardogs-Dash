const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../../data/player-stats.json');
let snapshot;

function read() {
  if (!snapshot) {
    try { snapshot = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      snapshot = { players: {}, updatedAt: null, lastAttemptDate: null };
    }
  }
  return snapshot;
}

function write(value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  snapshot = value;
}

module.exports = { read, write };
