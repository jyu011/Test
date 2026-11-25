const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const helmet = require('helmet');
const { db } = require('./lib/db');
const { loadUser, csrf, flash } = require('./lib/middleware');
const helpers = require('./lib/helpers');
const C = require('./lib/constants');
const payments = require('./lib/payments');
const bookings = require('./lib/bookings');
const mailer = require('./lib/mailer');

const app = express();
const PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

if (PROD && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET doit être défini en production.');
  process.exit(1);
}
if (PROD && payments.MODE === 'simulation' && process.env.PAYMENT_SIMULATION !== '1') {
  console.error('STRIPE_SECRET_KEY doit être défini en production (ou PAYMENT_SIMULATION=1 pour une démo sans paiement réel).');
  process.exit(1);
}
if (PROD && !mailer.smtpEnabled) console.warn('Attention : SMTP_HOST non défini, les e-mails ne sont pas envoyés (enregistrés dans data/emails).');

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
// Webhook Stripe : doit recevoir le corps brut (avant les autres lecteurs), sans session ni CSRF.
app.post('/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  let event;
  try {
    event = payments.webhookEvent(req.body, req.get('stripe-signature'));
  } catch (err) {
    return res.status(400).send(`Signature invalide : ${err.message}`);
  }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const r = await payments.checkoutResult(event.data.object.id);
      if (r.paid && r.bookingId) bookings.markPaid(r.bookingId, r);
    } else if (event.type === 'account.updated') {
      const acct = event.data.object;
      const ready = !!(acct.payouts_enabled && acct.capabilities && acct.capabilities.transfers === 'active');
      db.prepare('UPDATE tutor_profiles SET payouts_ready = ? WHERE stripe_account_id = ?').run(ready ? 1 : 0, acct.id);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[webhook]', err);
    res.status(500).send('Erreur');
  }
});

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
  Object.assign(res.locals, helpers, { C, path: req.path, query: req.query, payMode: payments.MODE });
  next();
});
app.use(flash);
app.use(loadUser);
app.use(csrf);

app.use(require('./routes/public'));
app.use(require('./routes/account'));
app.use(require('./routes/messages'));
app.use(require('./routes/admin'));
app.use(require('./routes/bookings'));
app.use(require('./routes/payouts'));

// En développement : boîte de réception locale pour lire les e-mails "envoyés".
if (!mailer.smtpEnabled && !PROD) {
  const fs = require('fs');
  app.get('/dev/emails', (req, res) => {
    const files = fs.readdirSync(mailer.OUTBOX).filter((f) => f.endsWith('.html')).sort().reverse().slice(0, 100);
    const items = files.map((f) => {
      const head = fs.readFileSync(path.join(mailer.OUTBOX, f), 'utf8').split('\n')[0];
      const m = /To: (.*) \| Subject: (.*) -->/.exec(head) || [];
      return { file: f, to: m[1], subject: m[2], at: new Date(Number(f.split('-')[0])) };
    });
    res.render('dev-emails', { title: 'E-mails (développement)', items });
  });
  app.get('/dev/emails/:file', (req, res) => {
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.sendFile(path.join(mailer.OUTBOX, path.basename(req.params.file)));
  });
}

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page introuvable', message: "Cette page n'existe pas (ou plus)." });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('error', { title: 'Oups', message: 'Une erreur est survenue. Réessaie dans un instant.' });
});

app.listen(PORT, () => {
  console.log(`Relais tourne sur http://localhost:${PORT} (paiements : ${payments.MODE}, e-mails : ${mailer.smtpEnabled ? 'SMTP' : 'dossier data/emails'})`);
});

// Tâches automatiques : rappels, demandes de validation, validation après 72 h, versements en attente.
const runTasks = () => bookings.runScheduledTasks().catch((err) => console.error('[tâches]', err));
setTimeout(runTasks, 5000);
setInterval(runTasks, 10 * 60 * 1000);
