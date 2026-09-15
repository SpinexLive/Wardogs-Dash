const store = require('../lib/store');

// Access flags are computed live against the store so settings changes apply without re-login.
function getAccessFlags(user) {
  if (!user) return { isAdmin: false, hasAccess: false };
  const access = store.readAccess();
  const isAdmin = user.roles.some((roleId) => access.adminRoleIds.includes(roleId));
  const hasAccess = isAdmin || user.roles.some((roleId) => access.allowedRoleIds.includes(roleId));
  return { isAdmin, hasAccess };
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  next();
}

function requireDashboardAccess(req, res, next) {
  const { hasAccess } = getAccessFlags(req.session.user);
  if (!hasAccess) return res.redirect('/access-denied');
  next();
}

function requireAdmin(req, res, next) {
  const { isAdmin } = getAccessFlags(req.session.user);
  if (!isAdmin) return res.status(403).render('error', { message: 'Admins only.' });
  next();
}

module.exports = { getAccessFlags, requireAuth, requireDashboardAccess, requireAdmin };
