const discord = require('./discord');
const rosterDb = require('./rosterDb');
const store = require('./store');

function formatCashChannelName(total) {
  // Discord permits Unicode channel names; the low single comma is intentional.
  const formatted = Math.max(0, Math.round(Number(total) || 0)).toLocaleString('en-GB').replace(/,/g, '‚');
  return `┊💵┊＄${formatted}`;
}

async function updateCashTotalChannel() {
  const channelId = store.readAccess().cashTotalChannelId;
  if (!channelId) return { skipped: true };
  return discord.renameChannel(channelId, formatCashChannelName(rosterDb.getCommunityCashTotal()));
}

module.exports = { formatCashChannelName, updateCashTotalChannel };
