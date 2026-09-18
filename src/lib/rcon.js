const config = require('../config');

// Wardogs RCON HTTP API (unofficial): https://wardogs.tech/rcon-reference
// Plain HTTP, bearer-token auth. Only call this from the server, over localhost/VPN/SSH tunnel.
function isConfigured() {
  return Boolean(config.RCON_PASSWORD);
}

const REQUEST_TIMEOUT_MS = 5000;

async function request(path, options = {}) {
  const url = `http://${config.RCON_HOST}:${config.RCON_PORT}${path}`;
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${config.RCON_PASSWORD}`, ...(options.headers || {}) },
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`RCON server at ${config.RCON_HOST}:${config.RCON_PORT} did not respond in time.`);
    }
    throw err;
  }
}

// Returns an array of reserved-slot SteamID64 strings.
async function getReservedSlots() {
  const res = await request('/v1/reserved-slots');
  if (!res.ok) throw new Error(`Failed to fetch reserved slots: ${res.status}`);
  const data = await res.json();
  return data.reservedSlots || [];
}

async function getServerStatus() {
  const res = await request('/v1/status');
  if (!res.ok) throw new Error(`Failed to fetch server status: ${res.status}`);
  return res.json();
}

async function getPlayers() {
  const res = await request('/v1/players');
  if (!res.ok) throw new Error(`Failed to fetch connected players: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.players) ? data.players : [];
}

async function getCapabilities() {
  const res = await request('/v1/capabilities');
  if (!res.ok) throw new Error(`Failed to fetch capabilities: ${res.status}`);
  return res.json();
}

async function addReservedSlot(steamId) {
  const res = await request('/v1/reserved-slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steamId }),
  });
  if (!res.ok) throw new Error(`Failed to add reserved slot for ${steamId}: ${res.status}`);
  return res.json();
}

async function removeReservedSlot(steamId) {
  const res = await request(`/v1/reserved-slots/${encodeURIComponent(steamId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to remove reserved slot for ${steamId}: ${res.status}`);
  return res.json();
}

async function getConfig() {
  const res = await request('/v1/config');
  if (!res.ok) throw new Error(`Failed to fetch server config: ${res.status}`);
  return res.json();
}

async function putConfig(text, revision) {
  const res = await request('/v1/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain', 'If-Match': `"${revision}"` },
    body: text,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Failed to update server config: ${res.status}`);
  }
  return data;
}

async function validateConfig(text) {
  const res = await request('/v1/config/validate', {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data?.error?.message || data?.errors?.[0]?.message || `Server config validation failed: ${res.status}`);
  return data;
}

function replaceConfigValue(configText, sectionHeader, key, value) {
  const lines = configText.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) => line.trim() === sectionHeader);
  if (sectionStart === -1) throw new Error(`Could not find ${sectionHeader} in the server config.`);
  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) { sectionEnd = index; break; }
  }
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  const keyIndex = lines.slice(sectionStart + 1, sectionEnd).findIndex((line) => keyPattern.test(line));
  if (keyIndex === -1) lines.splice(sectionEnd, 0, `${key}=${value}`);
  else lines[sectionStart + 1 + keyIndex] = `${key}=${value}`;
  return lines.join('\n');
}

async function setServerName(name) {
  return setTeamEnforcementConfig(name, null);
}

async function setTeamEnforcementConfig(name, teamBalanceLocked) {
  const { text, revision, writable } = await getConfig();
  if (!writable) throw new Error('The RCON server does not allow config writes.');
  let updated = replaceConfigValue(text, '[/Script/WDGame.WDGameSession]', 'ServerName', name);
  if (typeof teamBalanceLocked === 'boolean') {
    updated = replaceConfigValue(updated, '[/Script/WDGame.WDGameStateSession]', 'bLockOverpopulatedTeamsConfig', teamBalanceLocked ? 'True' : 'False');
  }
  await validateConfig(updated);
  return putConfig(updated, revision);
}

async function setPlayerFaction(steamId, faction) {
  const res = await request(`/v1/players/${encodeURIComponent(steamId)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faction }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Failed to move player to faction: ${res.status}`);
  return data;
}

async function broadcast(message) {
  const res = await request('/v1/broadcast', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Failed to broadcast message: ${res.status}`);
  return data;
}

// Rewrites DefaultReservedPlayerIds inside [/Script/WDGame.WDGameSession], leaving everything else untouched.
function replaceReservedPlayerIds(configText, steamIds) {
  const sectionHeader = '[/Script/WDGame.WDGameSession]';
  const lines = configText.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) => line.trim() === sectionHeader);
  if (sectionStart === -1) {
    throw new Error(`Could not find ${sectionHeader} in the server config.`);
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^\s*\[/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const keyPattern = /^\s*[!.]DefaultReservedPlayerIds\s*=/;
  const before = lines.slice(0, sectionStart + 1);
  const sectionBody = lines.slice(sectionStart + 1, sectionEnd).filter((line) => !keyPattern.test(line));
  const after = lines.slice(sectionEnd);
  const newEntries = [
    '!DefaultReservedPlayerIds=ClearArray',
    ...steamIds.map((id) => `.DefaultReservedPlayerIds="${id}"`),
  ];

  return [...before, ...newEntries, ...sectionBody, ...after].join('\n');
}

// Sets the full reserved-slot list, using the live write endpoints on older builds
// and falling back to editing the config document on builds where they were removed.
async function setReservedSlots(steamIds) {
  const capabilities = await getCapabilities().catch(() => null);
  const supportsLegacyWrite = capabilities?.routes?.includes('POST /v1/reserved-slots');

  if (supportsLegacyWrite) {
    const current = new Set(await getReservedSlots());
    const target = new Set(steamIds);
    await Promise.all([
      ...[...target].filter((id) => !current.has(id)).map((id) => addReservedSlot(id)),
      ...[...current].filter((id) => !target.has(id)).map((id) => removeReservedSlot(id)),
    ]);
    return { count: target.size };
  }

  const { text, revision } = await getConfig();
  const result = await putConfig(replaceReservedPlayerIds(text, steamIds), revision);
  if (result.ok === false) {
    throw new Error(result.error?.message || result.errors?.[0]?.message || 'Server rejected the config update.');
  }
  return { count: steamIds.length };
}

module.exports = { isConfigured, getReservedSlots, getServerStatus, getPlayers, getCapabilities, setReservedSlots, setServerName, setTeamEnforcementConfig, setPlayerFaction, broadcast };

