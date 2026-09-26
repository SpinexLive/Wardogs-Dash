const config = require('../config');
const fs = require('fs');
const path = require('path');

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

// Returns null when the member is not connected to voice; the bot needs Connect
// permission for any voice channel whose presence it is asked to inspect. Discord
// returns 403 (rather than the voice state) when the bot lacks Connect on the
// channel the member is actually in, which we treat the same as "not present"
// since it can't be the attendance channel the bot does have access to.
async function getGuildVoiceState(userId) {
  const res = await fetch(`${API_BASE}/guilds/${config.DISCORD_GUILD_ID}/voice-states/${userId}`, {
    headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Failed to fetch Discord voice state: ${res.status}`);
  return res.json();
}

async function getGuildTextChannels() {
  const res = await fetch(`${API_BASE}/guilds/${config.DISCORD_GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch guild channels: ${res.status}`);
  return (await res.json()).filter((channel) => channel.type === 0).sort((a, b) => a.position - b.position);
}

async function getGuildEmojis() {
  const res = await fetch(`${API_BASE}/guilds/${config.DISCORD_GUILD_ID}/emojis`, { headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` } });
  if (!res.ok) throw new Error(`Failed to fetch guild emojis: ${res.status}`);
  return res.json();
}

async function createChannelMessage(channelId, payload) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/messages`, { method: 'POST', headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Failed to send channel message: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateChannelMessage(channelId, messageId, payload) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/messages/${messageId}`, { method: 'PATCH', headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Failed to update channel message: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deleteChannelMessage(channelId, messageId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE', headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete channel message: ${res.status} ${await res.text()}`);
}

async function createLeaderboardMessage(channelId, payload) {
  const logo = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'images', 'wardogs-logo.png'));
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([logo], { type: 'image/png' }), 'wardogs-logo.png');
  const res = await fetch(`${API_BASE}/channels/${channelId}/messages`, {
    method: 'POST', headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}` }, body: form,
  });
  if (!res.ok) throw new Error(`Failed to send leaderboard message: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateLeaderboardMessage(channelId, messageId, payload) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update leaderboard message: ${res.status} ${await res.text()}`);
  return res.json();
}

async function renameChannel(channelId, name) {
  const res = await fetch(`${API_BASE}/channels/${channelId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(`Failed to rename cash-total channel: ${res.status} ${body.message || ''}`.trim());
    if (res.status === 429) {
      error.retryAfterMs = Math.ceil(Number(body.retry_after || res.headers.get('retry-after') || 60) * 1000);
    }
    throw error;
  }
  return {
    channel: await res.json(),
    rateLimit: {
      remaining: Number(res.headers.get('x-ratelimit-remaining')),
      resetAfterMs: Math.ceil(Number(res.headers.get('x-ratelimit-reset-after')) * 1000),
    },
  };
}

module.exports = {
  getAuthorizeUrl,
  exchangeCode,
  getCurrentUser,
  getGuildMember,
  getGuildVoiceState,
  getGuildRoles,
  getGuildMembers,
  getGuildInfo,
  getGuildTextChannels,
  getGuildEmojis,
  createChannelMessage,
  updateChannelMessage,
  deleteChannelMessage,
  createLeaderboardMessage,
  updateLeaderboardMessage,
  renameChannel,
};
