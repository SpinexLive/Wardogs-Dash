const config = require('../config');

// Wardogs RCON HTTP API (unofficial): https://wardogs.tech/rcon-reference
// Plain HTTP, bearer-token auth. Only call this from the server, over localhost/VPN/SSH tunnel.
function isConfigured() {
  return Boolean(config.RCON_PASSWORD);
}

async function request(path, options = {}) {
  const url = `http://${config.RCON_HOST}:${config.RCON_PORT}${path}`;
  return fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${config.RCON_PASSWORD}`, ...(options.headers || {}) },
  });
}

// Returns an array of reserved-slot SteamID64 strings.
async function getReservedSlots() {
  const res = await request('/v1/reserved-slots');
  if (!res.ok) throw new Error(`Failed to fetch reserved slots: ${res.status}`);
  const data = await res.json();
  return data.reservedSlots || [];
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

module.exports = { isConfigured, getReservedSlots, setReservedSlots };

