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
  lib/rcon.js          Wardogs RCON API client (VIP/reserved slots)
  lib/roster.js        computes who should have VIP
  lib/store.js         reads/writes data/access.json
  lib/steamStore.js    reads/writes data/steam-ids.json
  lib/dashboardMetrics.js  aggregates live roster and operational metrics
  middleware/auth.js  auth/admin route guards
  routes/             auth, dashboard, members, settings routes
views/                EJS templates
public/css/           styles
public/images/        logo/static images
data/access.json      role access lists (gitignored, created on first run)
data/steam-ids.json   discord user id -> steam id (gitignored, created on first run)
data/operations.json  optional attendance, match, and roster-change records
data/sessions/        session store files (gitignored, created on first run)
```

## Raid-Helper roster events

The `/roster` page fetches events server-side from Raid-Helper v4 using the existing
`DISCORD_GUILD_ID` as its server ID. Set only `RAID_HELPER_API_TOKEN` in `.env`; the token is never
exposed to the browser. The adapter accepts top-level arrays as well as `events` or `data` response arrays and
only renders events whose `name` (or `title`) starts exactly with `⚔️`.

Saved rosters are stored in `data/wardogs.db` using SQLite. The database is created automatically
and contains separate `rosters`, `squads`, and `roster_assignments` tables; the file must remain on
the persistent `data` volume when deploying.

## Operational dashboard data

The dashboard continues to use the existing roster and Steam-ID stores for roster/VIP metrics.
It reads attendance, match history, and roster-change records from `data/operations.json` when
available. An empty or absent file renders an explicit empty state; no sample Discord data is used.
The importer can write this shape without changing the dashboard route:

```json
{
  "attendance": [{ "date": "2026-09-16", "label": "Training", "present": 18, "expected": 24 }],
  "matches": [{ "date": "2026-09-15", "opponent": "Example Clan", "result": "win", "score": "3–1" }],
  "rosterChanges": [{ "date": "2026-09-14", "member": "Player", "type": "Promoted" }]
}
```

## Deploying to your VPS with Docker

This repo ships with a `docker-compose.yml` that runs the app plus a Caddy reverse proxy
(automatic HTTPS via Let's Encrypt) side by side, both using host networking. Concretely, for a
VPS at `45.151.81.182` with no domain of its own, we use a **sslip.io hostname**
(`45-151-81-182.sslip.io`) — it resolves straight to that IP, so Caddy can get a real, trusted
certificate for it with zero DNS setup.

1. **Push this repo to GitHub** (or GitLab), then on the VPS:
   ```
   git clone <your-repo-url> wardogs-dash
   cd wardogs-dash
   ```
2. **Update the Discord app's redirect URI.** In the Developer Portal → OAuth2 → Redirects, add:
   ```
   https://45-151-81-182.sslip.io/auth/discord/callback
   ```
   (keep your `http://localhost:3000/...` one too, for local dev).
3. **Create `.env` on the VPS** (copy `.env.example` and fill in):
   - `NODE_ENV=production`
   - `PORT=3001` — this VPS already runs another app on 3000 (host networking shares one port
     space across every app on the box), so this app needs its own free port. `Caddyfile` is
     already set to proxy to `3001`; if you pick a different port, update it there too.
   - `DISCORD_CALLBACK_URL=https://45-151-81-182.sslip.io/auth/discord/callback`
   - `SESSION_SECRET` — generate a fresh one, don't reuse your local dev value:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `DISCORD_CLIENT_ID/SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `ADMIN_ROLE_IDS` — same
     values as local.
   - `RCON_HOST`/`RCON_PORT`/`RCON_PASSWORD` — point at wherever the game server's RCON listener
     actually is (it doesn't have to be this VPS). Never expose the RCON port to the public
     internet; reach it over a VPN/SSH tunnel if it's remote.
4. **Open the firewall** for HTTP/HTTPS if it isn't already (Caddy needs 80 for the ACME
   challenge and 443 for TLS): e.g. `ufw allow 80,443/tcp`.
5. **Build and run:**
   ```
   docker compose up -d --build
   ```
   Caddy will automatically request a Let's Encrypt certificate for
   `45-151-81-182.sslip.io` on first boot (needs port 80 reachable from the internet). The `./data`
   volume persists `access.json`, `steam-ids.json`, and sessions across rebuilds.
6. **Visit** `https://45-151-81-182.sslip.io` and log in with your admin Discord account.
7. **Redeploying after code changes:** `git pull` on the VPS, then `docker compose up -d --build`
   again. The `./data` volume is untouched by rebuilds.

If you later get a real domain, just swap the hostname in `Caddyfile` and `DISCORD_CALLBACK_URL`
(and update the Discord redirect URI) — everything else stays the same.

## Notes / next steps

- Sessions are stored in `data/sessions` via `session-file-store`, so they survive restarts and
  redeploys as long as the `data` volume persists. For multiple replicas/instances you'd want a
  shared store (e.g. Redis) instead.
