const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const path = require('path');

const config = require('./config');
const store = require('./lib/store');
const steamStore = require('./lib/steamStore');
const { getAccessFlags } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const membersRoutes = require('./routes/members');
const settingsRoutes = require('./routes/settings');
const rosterRoutes = require('./routes/roster');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

store.ensureStore(config.ADMIN_ROLE_IDS);
steamStore.ensureStore();
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Required behind a reverse proxy (Docker/Nginx/Caddy) so secure cookies and req.secure work.
if (config.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

app.use(
  session({
    store: new FileStore({
      path: SESSIONS_DIR,
      ttl: SESSION_MAX_AGE_MS / 1000,
      logFn: () => {},
    }),
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
    },
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.access = getAccessFlags(req.session.user);
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login');
});

app.get('/access-denied', (req, res) => {
  res.render('access-denied');
});

app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/members', membersRoutes);
app.use('/settings', settingsRoutes);
app.use('/roster', rosterRoutes);

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Something went wrong. Check the server logs for details.' });
});

app.listen(config.PORT, () => {
  console.log(`Wardogs Dash running at http://localhost:${config.PORT}`);
});
