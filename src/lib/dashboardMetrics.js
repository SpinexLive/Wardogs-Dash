const fs = require('fs');
const path = require('path');
const discord = require('./discord');
const store = require('./store');
const steamStore = require('./steamStore');
const rcon = require('./rcon');

const OPERATIONS_FILE = path.join(__dirname, '..', '..', 'data', 'operations.json');

function readOperations() {
  if (!fs.existsSync(OPERATIONS_FILE)) return { attendance: [], matches: [], rosterChanges: [] };
  const data = JSON.parse(fs.readFileSync(OPERATIONS_FILE, 'utf8'));
  return {
    attendance: Array.isArray(data.attendance) ? data.attendance : [],
    matches: Array.isArray(data.matches) ? data.matches : [],
    rosterChanges: Array.isArray(data.rosterChanges) ? data.rosterChanges : [],
  };
}

function newestFirst(records) {
  return [...records].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function calculateAttendance(records) {
  if (!records.length) return null;
  const present = records.reduce((total, record) => total + Number(record.present || 0), 0);
  const expected = records.reduce((total, record) => total + Number(record.expected || 0), 0);
  return expected ? Math.round((present / expected) * 100) : null;
}

function calculateWinRate(matches) {
  const completed = matches.filter((match) => ['win', 'loss', 'draw'].includes(match.result));
  return completed.length ? Math.round((completed.filter((match) => match.result === 'win').length / completed.length) * 100) : null;
}

async function getDashboardMetrics() {
  const [guildMembers, access] = await Promise.all([discord.getGuildMembers(), store.readAccess()]);
  const steamIds = steamStore.readSteamIds();
  const operations = readOperations();
  const roster = access.memberRoleIds.length ? guildMembers.filter((member) => member.roles.some((id) => access.memberRoleIds.includes(id))) : [];
  const eligible = roster.filter((member) => !access.recruitRankRoleId || !member.roles.includes(access.recruitRankRoleId));
  const steamLinked = roster.filter((member) => steamIds[member.user.id]).length;
  const attendance = newestFirst(operations.attendance);
  const matches = newestFirst(operations.matches);
  let serverPlayers = null;
  let serverCapacity = null;
  if (rcon.isConfigured()) {
    try {
      const status = await rcon.getServerStatus();
      serverPlayers = Number(status.players?.current ?? 0);
      serverCapacity = status.players?.max ?? null;
    } catch (_) {
      // The dashboard remains usable when the game server is offline or unreachable.
    }
  }

  return {
    metrics: {
      rosterCount: roster.length,
      memberRanked: roster.filter((member) => access.memberRankRoleId && member.roles.includes(access.memberRankRoleId)).length,
      steamLinked,
      steamCoverage: roster.length ? Math.round((steamLinked / roster.length) * 100) : 0,
      vipEligible: eligible.filter((member) => steamIds[member.user.id]).length,
      attendanceRate: calculateAttendance(attendance),
      winRate: calculateWinRate(matches),
      matchesPlayed: matches.length,
      serverPlayers,
      serverCapacity,
    },
    attendance: attendance.slice(0, 4),
    matches: matches.slice(0, 5),
    rosterChanges: newestFirst(operations.rosterChanges).slice(0, 5),
  };
}

module.exports = { getDashboardMetrics };
