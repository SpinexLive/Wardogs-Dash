const config = require('../config');

const API_BASE = 'https://discord.com/api/v10';

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    redirect_uri: config.DISCORD_CALLBACK_URL,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return `${API_BASE}/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    client_secret: config.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.DISCORD_CALLBACK_URL,
  });

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Failed to exchange OAuth code: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getCurrentUser(accessToken) {
  const res = await fetch(`${API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Discord user: ${res.status}`);
  return res.json();
}

// Requires the bot to already be a member of the guild. Returns null if the user isn't a member.
async function getGuildMember(userId) {
  const res = await fetch(`${API_BASE}/guilds/${config.DISCORD_GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch guild member: ${res.status}`);
  return res.json();
}

async function getGuildRoles() {
  const res = await fetch(`${API_BASE}/guilds/${config.DISCORD_GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch guild roles: ${res.status}`);
  return res.json();
}

// Requires the "Server Members Intent" enabled for the bot in the Discord Developer Portal.
async function getGuildMembers() {
  const members = [];
  let after = '0';

  for (;;) {
    const res = await fetch(
      `${API_BASE}/guilds/${config.DISCORD_GUILD_ID}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` } }
    );
    if (!res.ok) throw new Error(`Failed to fetch guild members: ${res.status}`);
    const batch = await res.json();
    members.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }

  return members;
}

async function getGuildInfo() {
  const res = await fetch(`${API_BASE}/guilds/${config.DISCORD_GUILD_ID}?with_counts=true`, {
    headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch guild info: ${res.status}`);
  return res.json();
}

module.exports = {
  getAuthorizeUrl,
  exchangeCode,
  getCurrentUser,
  getGuildMember,
  getGuildRoles,
  getGuildMembers,
  getGuildInfo,
};
