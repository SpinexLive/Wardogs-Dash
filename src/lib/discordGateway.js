// Maintains a live Discord Gateway connection so voice channel presence can be
// read from an in-memory cache instead of the REST API, which requires the bot
// to have Connect permission on whatever channel each user happens to be in.
const WebSocket = require('ws');
const config = require('../config');

const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const INTENT_GUILDS = 1 << 0;
const INTENT_GUILD_VOICE_STATES = 1 << 7;

const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID_SESSION: 9, HELLO: 10, HEARTBEAT_ACK: 11 };

// Map of userId -> channelId (or null when not in voice) for our guild.
const voiceStates = new Map();

let ws = null;
let heartbeatTimer = null;
let seq = null;
let sessionId = null;
let resumeUrl = null;
let ready = false;
let reconnectDelay = 1000;

function log(...args) { console.log('[discord-gateway]', ...args); }

function send(op, d) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op, d }));
}

function identify() {
  send(OP.IDENTIFY, {
    token: config.DISCORD_BOT_TOKEN,
    intents: INTENT_GUILDS | INTENT_GUILD_VOICE_STATES,
    properties: { os: 'linux', browser: 'wardogs-dash', device: 'wardogs-dash' },
  });
}

function resume() {
  send(OP.RESUME, { token: config.DISCORD_BOT_TOKEN, session_id: sessionId, seq });
}

function startHeartbeat(intervalMs) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => send(OP.HEARTBEAT, seq), intervalMs);
}

function applyVoiceState(state) {
  if (!state || String(state.guild_id) !== String(config.DISCORD_GUILD_ID)) return;
  if (state.channel_id) voiceStates.set(state.user_id, state.channel_id);
  else voiceStates.delete(state.user_id);
}

function handleDispatch(t, d) {
  if (t === 'READY') {
    sessionId = d.session_id;
    resumeUrl = d.resume_gateway_url;
    reconnectDelay = 1000;
    log('connected');
  } else if (t === 'RESUMED') {
    ready = true;
    reconnectDelay = 1000;
  } else if (t === 'GUILD_CREATE' && String(d.id) === String(config.DISCORD_GUILD_ID)) {
    // Voice states embedded here omit guild_id since it's implied by the parent guild.
    voiceStates.clear();
    (d.voice_states || []).forEach((state) => applyVoiceState({ ...state, guild_id: d.id }));
    ready = true;
  } else if (t === 'VOICE_STATE_UPDATE') {
    applyVoiceState(d);
  }
}

function connect() {
  if (!config.DISCORD_BOT_TOKEN || !config.DISCORD_GUILD_ID) return;
  ready = false;
  ws = new WebSocket(resumeUrl ? `${resumeUrl}/?v=10&encoding=json` : GATEWAY_URL);

  ws.on('message', (raw) => {
    const payload = JSON.parse(raw);
    if (payload.s != null) seq = payload.s;
    switch (payload.op) {
      case OP.HELLO:
        startHeartbeat(payload.d.heartbeat_interval);
        sessionId ? resume() : identify();
        break;
      case OP.HEARTBEAT:
        send(OP.HEARTBEAT, seq);
        break;
      case OP.INVALID_SESSION:
        sessionId = null;
        setTimeout(() => (payload.d ? resume() : identify()), 1500);
        break;
      case OP.RECONNECT:
        ws.close();
        break;
      case OP.DISPATCH:
        handleDispatch(payload.t, payload.d);
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    ready = false;
    clearInterval(heartbeatTimer);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.on('error', (err) => log('socket error:', err.message));
}

function isReady() { return ready; }

// Returns the set of user IDs currently connected to the given voice channel.
function getChannelMembers(channelId) {
  const members = new Set();
  for (const [userId, userChannelId] of voiceStates) {
    if (userChannelId === channelId) members.add(userId);
  }
  return members;
}

module.exports = { connect, isReady, getChannelMembers };
