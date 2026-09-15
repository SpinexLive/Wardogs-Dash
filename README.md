# Wardogs Dash

Discord-authenticated dashboard for the Wardogs community. Members log in with Discord; only
authorized roles get in. Admin roles can access **Settings** to grant other server roles access
to the dashboard.

## How it works

- **Login**: "Login with Discord" starts an OAuth2 flow (`identify` scope only).
- **Authorization**: after login, the app uses your existing **bot's token** to look up the
  member's roles in your guild (`GET /guilds/{guild}/members/{user}`). No extra OAuth scopes or
  user consent for roles needed.
- **Access levels** (stored in `data/access.json`, editable from the Settings page):
  - `adminRoleIds` — full access, including Settings.
  - `allowedRoleIds` — dashboard access only.
- On first run, `adminRoleIds` is seeded from `ADMIN_ROLE_IDS` in `.env`.

## Setup

1. **Discord Developer Portal** (https://discord.com/developers/applications) → select the
   application your bot belongs to:
   - OAuth2 → General: copy **Client ID** and **Client Secret**.
   - OAuth2 → General → Redirects: add `http://localhost:3000/auth/discord/callback`.
   - Bot → copy the **Bot Token** (same bot already in your server).
2. Get your **Guild ID** (right-click your server in Discord with Developer Mode enabled → Copy
   Server ID) and the **role ID** for your admin role(s) (right-click a role in Server Settings →
   Roles, or right-click a member with that role).
3. Copy `.env.example` to `.env` and fill in:
   ```
   DISCORD_CLIENT_ID=
   DISCORD_CLIENT_SECRET=
   DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback
   DISCORD_BOT_TOKEN=
   DISCORD_GUILD_ID=
   ADMIN_ROLE_IDS=role_id_1,role_id_2
   SESSION_SECRET=some-long-random-string
   ```
4. Install dependencies and run:
   ```
   npm install
   npm run dev
   ```
5. Visit http://localhost:3000 and log in with an account that has one of the `ADMIN_ROLE_IDS`.

## Project structure

```
src/
  config.js          env var loading
  server.js           app entry point
  lib/discord.js      Discord OAuth2 + bot REST API calls
  lib/store.js         reads/writes data/access.json
  middleware/auth.js  auth/admin route guards
  routes/             auth, dashboard, settings routes
views/                EJS templates
public/css/           styles
data/access.json      role access lists (gitignored, created on first run)
```

## Notes / next steps

- Sessions currently use the default in-memory store — fine for local dev, but swap for a
  persistent store (e.g. `connect-redis`) before running multiple instances in production.
- A `Dockerfile` will be added later for VPS deployment.
