const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const helmet = require('helmet');
const { db } = require('./lib/db');
const { loadUser, csrf, flash } = require('./lib/middleware');
const helpers = require('./lib/helpers');
const C = require('./lib/constants');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

if (PROD && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET doit être défini en production.');
  process.exit(1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (PROD) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'style-src': ["'self'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:'],
    },
  },
}));

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '7d' : 0 }));
app.use('/uploads', express.static(helpers.UPLOAD_PUBLIC, { maxAge: PROD ? '30d' : 0 }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '50kb' }));

app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: process.env.SESSION_SECRET || 'dev-secret-a-changer',
  name: 'relais.sid',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 30 * 24 * 3600 * 1000 },
}));

app.use((req, res, next) => {
  Object.assign(res.locals, helpers, { C, path: req.path, query: req.query });
  next();
});
app.use(flash);
app.use(loadUser);
app.use(csrf);

app.use(require('./routes/public'));
app.use(require('./routes/account'));
app.use(require('./routes/messages'));
app.use(require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas (ou plus)." });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('error', { title: 'Oups', message: 'Une erreur est survenue. Réessaie dans un instant.' });
});

app.listen(PORT, () => console.log(`Relais tourne sur http://localhost:${PORT}`));
