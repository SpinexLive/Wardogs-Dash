const express = require('express');
const session = require('express-session');
const path = require('path');

const config = require('./config');
const store = require('./lib/store');
const steamStore = require('./lib/steamStore');
const { getAccessFlags } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const membersRoutes = require('./routes/members');
const settingsRoutes = require('./routes/settings');

store.ensureStore(config.ADMIN_ROLE_IDS);
steamStore.ensureStore();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
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
