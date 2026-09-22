const fs = require('fs');
const path = require('path');
const discord = require('./discord');
const store = require('./store');
const steamStore = require('./steamStore');
const rcon = require('./rcon');
const rosterDb = require('./rosterDb');
const warcon = require('./warcon');

const OPERATIONS_FILE = path.join(__dirname, '..', '..', 'data', 'operations.json');

function readOperations() {
  if (!fs.existsSync(OPERATIONS_FILE)) return { attendance: [], matches: [] };
  const data = JSON.parse(fs.readFileSync(OPERATIONS_FILE, 'utf8'));
  return {
    attendance: Array.isArray(data.attendance) ? data.attendance : [],
    matches: Array.isArray(data.matches) ? data.matches : [],
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

function calculateClanAverages(performance) {
  const values = [...performance.values()];
  if (!values.length) return null;
  const totals = values.reduce((total, player) => ({
    kills: total.kills + player.kills,
    deaths: total.deaths + player.deaths,
    sessions: total.sessions + player.sessions,
    minutes: total.minutes + player.minutes,
  }), { kills: 0, deaths: 0, sessions: 0, minutes: 0 });
  return {
    tracked: values.length,
    kills: totals.kills / values.length,
    deaths: totals.deaths / values.length,
    sessions: totals.sessions / values.length,
    minutes: totals.minutes / values.length,
    kd: totals.deaths ? totals.kills / totals.deaths : totals.kills,
    kpm: totals.minutes ? totals.kills / totals.minutes : 0,
  };
}

async function getDashboardMetrics() {
  const [guildMembers, access] = await Promise.all([discord.getGuildMembers(), store.readAccess()]);
  const steamIds = steamStore.readSteamIds();
  const operations = readOperations();
  const roster = access.memberRoleIds.length ? guildMembers.filter((member) => member.roles.some((id) => access.memberRoleIds.includes(id))) : [];
  const steamLinked = roster.filter((member) => steamIds[member.user.id]).length;
  let clanAverages = null;
  if (warcon.isConfigured()) {
    try {
      clanAverages = calculateClanAverages(await warcon.getPlayerSummaries(roster.map((member) => steamIds[member.user.id]).filter(Boolean)));
    } catch (_) {
      // Performance data is supplementary; a Warcon outage must not block the dashboard.
    }
  }
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
      attendanceRate: calculateAttendance(attendance),
      winRate: calculateWinRate(matches),
      matchesPlayed: matches.length,
      serverPlayers,
      serverCapacity,
      cashEarned: rosterDb.getCommunityCashTotal(),
      clanAverages,
    },
    attendance: attendance.slice(0, 4),
    matches: matches.slice(0, 5),
  };
}

module.exports = { getDashboardMetrics };
