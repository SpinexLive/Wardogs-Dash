const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { respondToRosterButton } = require('../lib/rosterDiscord');

const router = express.Router();
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function isValidSignature(req) {
  if (!config.DISCORD_PUBLIC_KEY) return false;
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');
  if (!signature || !timestamp) return false;
  try {
    const key = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(config.DISCORD_PUBLIC_KEY, 'hex')]);
    return crypto.verify(null, Buffer.concat([Buffer.from(timestamp), req.body]), { key, format: 'der', type: 'spki' }, Buffer.from(signature, 'hex'));
  } catch (_) { return false; }
}

router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  if (!isValidSignature(req)) return res.status(401).send('invalid request signature');
  const interaction = JSON.parse(req.body.toString('utf8'));
  if (interaction.type === 1) return res.json({ type: 1 });
  const match = /^(WD-confirm|WD-Decline):(.+)$/.exec(interaction.data?.custom_id || '');
  if (interaction.type !== 3 || !match) return res.status(400).send('unsupported interaction');
  const playerId = interaction.member?.user?.id || interaction.user?.id;
  const status = match[1] === 'WD-confirm' ? 'confirmed' : 'declined';
  // A deferred message update acknowledges within Discord's three-second window.
  res.json({ type: 6 });
  respondToRosterButton(match[2], playerId, status).catch((err) => console.warn(`[roster-discord] ${err.message}`));
});

module.exports = router;
