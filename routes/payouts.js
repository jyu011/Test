// Versements aux profs (configuration du RIB via Stripe) + pages de simulation en développement.
const express = require('express');
const { db } = require('../lib/db');
const payments = require('../lib/payments');
const B = require('../lib/bookings');
const { requireRole } = require('../lib/middleware');
const { slotLabel, euros, durationLabel } = require('../lib/time');

const router = express.Router();

// Ouvre le formulaire sécurisé Stripe où le prof saisit son RIB et son identité.
router.get('/compte/versements/configurer', requireRole('prof'), async (req, res) => {
  try {
    let tp = db.prepare('SELECT stripe_account_id FROM tutor_profiles WHERE user_id = ?').get(req.user.id);
    if (!tp.stripe_account_id) {
      const u = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.user.id);
      const accountId = await payments.createAccount(u);
      db.prepare('UPDATE tutor_profiles SET stripe_account_id = ? WHERE user_id = ?').run(accountId, req.user.id);
      tp = { stripe_account_id: accountId };
    }
    res.redirect(303, await payments.onboardingUrl(tp.stripe_account_id));
  } catch (err) {
    console.error('[versements]', err.message);
    req.flash('error', 'La configuration des versements est momentanément indisponible. Réessaie plus tard.');
    res.redirect('/compte');
  }
});

// Retour depuis Stripe : on vérifie que le compte est prêt à recevoir des virements.
router.get('/compte/versements/retour', requireRole('prof'), async (req, res) => {
  const tp = db.prepare('SELECT stripe_account_id FROM tutor_profiles WHERE user_id = ?').get(req.user.id);
  let ready = false;
  try { ready = !!tp.stripe_account_id && await payments.accountReady(tp.stripe_account_id); } catch (err) { console.error(err.message); }
  db.prepare('UPDATE tutor_profiles SET payouts_ready = ? WHERE user_id = ?').run(ready ? 1 : 0, req.user.id);
  req.flash(ready ? 'success' : 'info', ready
    ? 'Versements configurés : tu peux recevoir tes paiements.'
    : "Configuration incomplète ou en cours de vérification par Stripe. Reviens finir l'étape si besoin.");
  if (ready) B.runScheduledTasks().catch(() => {}); // verse les paiements en attente
  res.redirect('/compte');
});

router.get('/compte/versements/tableau', requireRole('prof'), async (req, res) => {
  const tp = db.prepare('SELECT stripe_account_id FROM tutor_profiles WHERE user_id = ?').get(req.user.id);
  if (!tp.stripe_account_id) return res.redirect('/compte');
  try { res.redirect(303, await payments.dashboardUrl(tp.stripe_account_id)); } catch (err) {
    req.flash('error', 'Tableau de bord des versements indisponible pour le moment.');
    res.redirect('/compte');
  }
});

// ---------- Pages de SIMULATION (uniquement sans clé Stripe) ----------
if (payments.MODE === 'simulation') {
  router.get('/simulation/versements', requireRole('prof'), (req, res) => {
    res.render('simulation-payout', { title: 'Simulation – versements' });
  });
  router.post('/simulation/versements', requireRole('prof'), (req, res) => {
    db.prepare('UPDATE tutor_profiles SET payouts_ready = 1 WHERE user_id = ?').run(req.user.id);
    res.redirect('/compte/versements/retour');
  });

  router.get('/simulation/paiement/:id', requireRole('eleve'), (req, res) => {
    const b = db.prepare("SELECT * FROM bookings WHERE id = ? AND student_id = ? AND status = 'confirmee'").get(parseInt(req.params.id, 10), req.user.id);
    if (!b) return res.redirect('/planning');
    const tutor = db.prepare('SELECT first_name FROM users WHERE id = ?').get(b.tutor_id);
    res.render('simulation-checkout', { title: 'Simulation – paiement', b, tutor, when: slotLabel(b), price: euros(b.price_cents), duration: durationLabel(b.duration_min) });
  });
  router.post('/simulation/paiement/:id', requireRole('eleve'), (req, res) => {
    const b = db.prepare("SELECT * FROM bookings WHERE id = ? AND student_id = ? AND status = 'confirmee'").get(parseInt(req.params.id, 10), req.user.id);
    if (!b) return res.redirect('/planning');
    res.redirect(`/reservations/${b.id}/paiement/retour?session_id=${encodeURIComponent(b.checkout_session_id)}`);
  });
}

module.exports = router;
