const express = require('express');
const rcon = require('../lib/rcon');
const store = require('../lib/store');
const { pollTeamEnforcement } = require('../lib/teamEnforcement');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const STANDARD_SERVER_NAME = '³³¹ | COMPETITIVE [EU/EN] | Discord.gg/331st';
const ENFORCED_SERVER_NAME = '³³¹ | 50 v 50 | COMPETITIVE [EU/EN] | Discord.gg/331st';

async function getPageData() {
  if (!rcon.isConfigured()) return { status: null, capabilities: null, factionCounts: {}, error: 'RCON is not configured.' };
  try {
    const [status, capabilities, players] = await Promise.all([rcon.getServerStatus(), rcon.getCapabilities(), rcon.getPlayers()]);
    const factionCounts = players.reduce((counts, player) => ({ ...counts, [player.faction]: (counts[player.faction] || 0) + 1 }), {});
    return { status, capabilities, factionCounts, error: null };
  } catch (err) {
    return { status: null, capabilities: null, factionCounts: {}, error: err.message };
  }
}

async function renderPage(req, res, overrides = {}) {
  const data = await getPageData();
  res.status(overrides.status || 200).render('team-control', {
    active: 'team-control',
    enforcement: store.readAccess().teamEnforcement,
    standardServerName: STANDARD_SERVER_NAME,
    enforcedServerName: ENFORCED_SERVER_NAME,
    saved: false,
    ...data,
    ...overrides,
  });
}

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try { await renderPage(req, res, { saved: req.query.saved === '1' }); }
  catch (err) { next(err); }
});

router.post('/configure', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!rcon.isConfigured()) throw new Error('RCON is not configured.');
    const enabled = req.body.enabled === 'on';
    const allowedFactionOne = String(req.body.allowedFactionOne || '');
    const allowedFactionTwo = String(req.body.allowedFactionTwo || '');
    const blockedFaction = String(req.body.blockedFaction || '');
    const [status, capabilities] = await Promise.all([rcon.getServerStatus(), rcon.getCapabilities()]);
    const factionNames = new Set((status.factionScores || []).map((faction) => faction.name));

    if (enabled) {
      if (!capabilities.routes?.includes('PATCH /v1/players/{id}')) throw new Error('This server does not support moving players between factions.');
      if (new Set([allowedFactionOne, allowedFactionTwo, blockedFaction]).size !== 3 || ![allowedFactionOne, allowedFactionTwo, blockedFaction].every((name) => factionNames.has(name))) {
        throw new Error('Choose two different allowed factions and one different blocked faction from the live server list.');
      }
    }

    await rcon.setServerName(enabled ? ENFORCED_SERVER_NAME : STANDARD_SERVER_NAME);
    store.writeAccess({
      ...store.readAccess(),
      teamEnforcement: { enabled, allowedFactionOne, allowedFactionTwo, blockedFaction },
    });
    if (enabled) await pollTeamEnforcement();
    res.redirect('/team-control?saved=1');
  } catch (err) {
    try { await renderPage(req, res, { status: 400, error: err.message }); }
    catch (renderError) { next(renderError); }
  }
});

module.exports = router;
