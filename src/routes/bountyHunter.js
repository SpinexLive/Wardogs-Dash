const express = require('express');
const bountyDb = require('../lib/bountyDb');
const bountyHunter = require('../lib/bountyHunter');
const discord = require('../lib/discord');
const store = require('../lib/store');
const steamStore = require('../lib/steamStore');
const rcon = require('../lib/rcon');
const warcon = require('../lib/warcon');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

async function renderPage(req, res, overrides = {}) {
  res.status(overrides.status || 200).render('bounty-hunter', {
    active: 'bounty-hunter',
    activeBounty: bountyDb.getActiveBounty(),
    bounties: bountyDb.getRecentBounties(),
    configured: rcon.isConfigured() && warcon.isConfigured(),
    started: false,
    error: null,
    ...overrides,
  });
}

async function eligibleClanPlayers() {
  const access = store.readAccess();
  if (!access.memberRoleIds.length) throw new Error('Configure at least one clan Member Role before starting a bounty.');
  const [guildMembers, players] = await Promise.all([discord.getGuildMembers(), rcon.getPlayers()]);
  const steamIds = steamStore.readSteamIds();
  const clanDiscordIds = new Set(guildMembers.filter((member) => member.roles.some((role) => access.memberRoleIds.includes(role))).map((member) => member.user.id));
  const clanSteamIds = new Set([...clanDiscordIds].map((id) => String(steamIds[id] || '')).filter(Boolean));
  return players.filter((player) => player.steamId && clanSteamIds.has(String(player.steamId))).map((player) => ({ steamId: String(player.steamId), name: player.name || 'Unknown player', faction: player.faction || null }));
}

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try { await renderPage(req, res, { started: req.query.started === '1' }); }
  catch (err) { next(err); }
});

router.post('/start', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!rcon.isConfigured() || !warcon.isConfigured()) throw new Error('RCON and the Warcon kill-feed API must both be configured.');
    if (bountyDb.getActiveBounty()) throw new Error('A bounty is already active. Claim or cancel it before starting another.');
    const candidates = await eligibleClanPlayers();
    if (!candidates.length) throw new Error('No clan members with linked Steam IDs are currently on the server.');
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    // Verify access and mark the existing feed as baseline so an old death cannot
    // immediately resolve a newly announced bounty.
    const existingKills = await warcon.getKills({ victim: target.steamId, limit: 20 });
    const bounty = bountyDb.startBounty(target, req.session.user.id);
    existingKills.forEach((kill) => {
      if (kill.eventId) bountyDb.rememberFeedEvent(bounty.id, kill.eventId);
    });
    const message = `BOUNTY HUNTER: ${target.name} is wanted! Last seen fighting for ${target.faction || 'an unknown faction'}. Killing them gives 3 days Priority Access to our server.`;
    try {
      await rcon.broadcast(message);
      bountyDb.addMessage(bounty.id, 'started', message, true);
    } catch (err) {
      bountyDb.cancelBounty(bounty.id);
      throw err;
    }
    bountyHunter.pollBountyHunter();
    res.redirect('/bounty-hunter?started=1');
  } catch (err) {
    try { await renderPage(req, res, { status: 400, error: err.message }); }
    catch (renderErr) { next(renderErr); }
  }
});

router.post('/:id/cancel', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const bounty = bountyDb.getActiveBounty();
    if (!bounty || String(bounty.id) !== req.params.id) throw new Error('That bounty is no longer active.');
    if (!bountyDb.cancelBounty(bounty.id)) throw new Error('Could not cancel the bounty.');
    const message = `BOUNTY CANCELLED: ${bounty.target_name} is no longer wanted.`;
    let sent = false;
    try {
      await rcon.broadcast(message);
      sent = true;
    } catch (broadcastError) {
      console.warn(`[bounty-hunter] cancellation announcement failed: ${broadcastError.message}`);
    }
    bountyDb.addMessage(bounty.id, 'cancelled', message, sent);
    res.redirect('/bounty-hunter');
  } catch (err) {
    try { await renderPage(req, res, { status: 400, error: err.message }); }
    catch (renderErr) { next(renderErr); }
  }
});

module.exports = router;
