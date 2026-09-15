const discord = require('./discord');
const store = require('./store');
const steamStore = require('./steamStore');

// Members holding the Member Role get VIP; the Recruit Role always overrides that.
async function getVipTargetSteamIds() {
  const access = store.readAccess();
  if (!access.memberRankRoleId) {
    return { steamIds: [], skipped: 0, configured: false };
  }

  const guildMembers = await discord.getGuildMembers();
  const steamIds = steamStore.readSteamIds();

  let skipped = 0;
  const targetIds = [];
  guildMembers.forEach((member) => {
    const hasMemberRank = member.roles.includes(access.memberRankRoleId);
    const hasRecruitRank = access.recruitRankRoleId && member.roles.includes(access.recruitRankRoleId);
    if (!hasMemberRank || hasRecruitRank) return;

    const steamId = steamIds[member.user.id];
    if (!steamId) {
      skipped += 1;
      return;
    }
    targetIds.push(steamId);
  });

  return { steamIds: targetIds, skipped, configured: true };
}

module.exports = { getVipTargetSteamIds };
