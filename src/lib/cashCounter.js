const discord = require('./discord');
const rosterDb = require('./rosterDb');
const store = require('./store');

// Channel-name edits are a tightly limited Discord route. Five minutes is a
// conservative fallback for its typical two-edits-per-ten-minutes allowance;
// Discord's response headers take precedence whenever they are available.
const FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

function formatCashChannelName(total) {
  // Discord permits Unicode channel names; the low single comma is intentional.
  const formatted = Math.max(0, Math.round(Number(total) || 0)).toLocaleString('en-GB').replace(/,/g, '‚');
  return `┊💵┊＄${formatted}`;
}

async function updateCashTotalChannel() {
  const access = store.readAccess();
  const channelId = access.cashTotalChannelId;
  if (!channelId) return { skipped: true };
  const name = formatCashChannelName(rosterDb.getCommunityCashTotal());
  const now = Date.now();
  if (access.cashTotalLastName === name) return { skipped: true, reason: 'unchanged' };
  if (Number(access.cashTotalNextUpdateAt) > now) return { skipped: true, reason: 'rate-limited' };

  try {
    const result = await discord.renameChannel(channelId, name);
    const { remaining, resetAfterMs } = result.rateLimit;
    const nextUpdateAt = Number.isFinite(resetAfterMs) && resetAfterMs > 0 && remaining <= 0
      ? now + resetAfterMs
      : now + FALLBACK_INTERVAL_MS;
    store.writeAccess({ ...access, cashTotalLastName: name, cashTotalNextUpdateAt: nextUpdateAt });
    return result;
  } catch (err) {
    if (err.retryAfterMs) {
      store.writeAccess({ ...access, cashTotalNextUpdateAt: now + err.retryAfterMs });
      return { skipped: true, reason: 'rate-limited' };
    }
    throw err;
  }
}

module.exports = { formatCashChannelName, updateCashTotalChannel };
