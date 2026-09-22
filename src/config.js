require('dotenv').config();

const required = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_CALLBACK_URL',
  'SESSION_SECRET',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(
    `[config] Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`
  );
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  DISCORD_CALLBACK_URL: process.env.DISCORD_CALLBACK_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ADMIN_ROLE_IDS: (process.env.ADMIN_ROLE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  // Optional: used for live game-server status and Bounty Hunter announcements.
  RCON_HOST: process.env.RCON_HOST || '127.0.0.1',
  RCON_PORT: process.env.RCON_PORT || '7776',
  RCON_PASSWORD: process.env.RCON_PASSWORD || '',
  RAID_HELPER_API_TOKEN: process.env.RAID_HELPER_API_TOKEN || '',
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY || '',
  WARCON_API_KEY: process.env.WARCON_API_KEY || '',
  WARCON_SERVER_ID: process.env.WARCON_SERVER_ID || '',
};
