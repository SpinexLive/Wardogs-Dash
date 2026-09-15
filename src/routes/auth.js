const express = require('express');
const crypto = require('crypto');
const discord = require('../lib/discord');
const { getAccessFlags } = require('../middleware/auth');

const router = express.Router();

router.get('/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  res.redirect(discord.getAuthorizeUrl(state));
});

router.get('/discord/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState) {
      return res.status(400).render('error', { message: 'Invalid login attempt, please try again.' });
    }
    delete req.session.oauthState;

    const tokenData = await discord.exchangeCode(code);
    const discordUser = await discord.getCurrentUser(tokenData.access_token);
    const member = await discord.getGuildMember(discordUser.id);

    if (!member) {
      return res.status(403).render('error', { message: 'You are not a member of this Discord server.' });
    }

    req.session.user = {
      id: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      tag:
        discordUser.discriminator && discordUser.discriminator !== '0'
          ? `${discordUser.username}#${discordUser.discriminator}`
          : discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Number(discordUser.discriminator || 0) % 5}.png`,
      roles: member.roles,
    };

    const { hasAccess } = getAccessFlags(req.session.user);
    if (!hasAccess) return res.redirect('/access-denied');
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
