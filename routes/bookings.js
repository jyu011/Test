const express = require('express');
const { db } = require('../lib/db');
const B = require('../lib/bookings');
const payments = require('../lib/payments');
const { requireLogin, requireRole } = require('../lib/middleware');
const { parisToDate, parisDay, parisTime, parisShortDay, parisLongDay, slotLabel, mondayOf, addDays, euros, durationLabel, toIso } = require('../lib/time');
const { publicName, split, clean } = require('../lib/helpers');
const C = require('../lib/constants');

const router = express.Router();
const HOUR = 3600 * 1000;

function conversationFor(id, userId) {
  return db.prepare('SELECT * FROM conversations WHERE id = ? AND (student_id = ? OR tutor_id = ?)').get(id, userId, userId);
}
function bookingFor(id, userId) {
  return db.prepare('SELECT * FROM bookings WHERE id = ? AND (student_id = ? OR tutor_id = ?)').get(id, userId, userId);
}
const tutorProfile = (id) => db.prepare('SELECT * FROM tutor_profiles WHERE user_id = ?').get(id);
const isVerified = (userId) => !!db.prepare('SELECT email_verified FROM users WHERE id = ?').get(userId).email_verified;

// Conditions pour pouvoir réserver : e-mail confirmé (élève) et versements configurés (prof).
function bookingBlocker(req, conv) {
  const tp = tutorProfile(conv.tutor_id);
  if (!tp || tp.status !== 'verifie') return "Ce prof n'est pas disponible pour le moment.";
  if (req.user.role === 'eleve' && !isVerified(req.user.id)) return "Confirme d'abord ton adresse e-mail (lien envoyé à l'inscription, ou renvoie-le depuis « Mon compte »).";
  if (!tp.payouts_ready) {
    return req.user.role === 'prof'
      ? 'Configure tes versements (ton RIB) dans « Mon compte » avant de proposer ou d\'accepter un cours.'
      : `${db.prepare('SELECT first_name FROM users WHERE id = ?').get(conv.tutor_id).first_name} n'a pas encore configuré ses versements : la réservation sera possible dès que ce sera fait.`;
  }
  return null;
}

function viewModel(b, me) {
  const other = db.prepare('SELECT id, first_name, last_name FROM users WHERE id = ?').get(me.id === b.student_id ? b.tutor_id : b.student_id);
  const start = new Date(b.starts_at).getTime();
  const end = new Date(b.ends_at).getTime();
  const isStudent = me.id === b.student_id;
  return {
    ...b, other, otherName: publicName(other), isStudent,
    when: slotLabel(b), day: parisShortDay(b.starts_at), from: parisTime(b.starts_at), to: parisTime(b.ends_at),
    duration: durationLabel(b.duration_min), price: euros(b.price_cents), commission: euros(b.commission_cents), tutorAmount: euros(b.tutor_amount_cents),
    statusLabel: B.STATUS_LABELS[b.status], modeLabel: C.MODES[b.mode] || b.mode,
    can: {
      accept: b.status === 'proposee' && b.proposed_by !== me.id && start > Date.now(),
      withdraw: b.status === 'proposee' && b.proposed_by === me.id,
      pay: isStudent && b.status === 'confirmee' && start > Date.now(),
      cancel: b.status === 'confirmee' || (b.status === 'payee' && B.canCancelPaid(b)),
      validate: isStudent && b.status === 'payee' && Date.now() >= start,
      report: isStudent && b.status === 'payee' && Date.now() >= start,
      lateCancel: b.status === 'payee' && !B.canCancelPaid(b) && Date.now() < start,
    },
    past: end < Date.now(),
  };
}

// ---------- Proposer un créneau (depuis la messagerie) ----------

router.get('/messages/:id/reserver', requireRole('eleve', 'prof'), (req, res) => {
  const conv = conversationFor(parseInt(req.params.id, 10), req.user.id);
  if (!conv) return res.redirect('/messages');
  const tp = tutorProfile(conv.tutor_id);
  const other = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(req.user.id === conv.student_id ? conv.tutor_id : conv.student_id);
  res.render('booking-new', {
    title: 'Réserver un cours', conv, tp, otherName: publicName(other), blocker: bookingBlocker(req, conv),
    v: { date: '', time: '', duration: 60, subject: split(tp.subjects)[0], mode: split(tp.modes)[0] }, errors: {},
    subjects: split(tp.subjects), modes: split(tp.modes), minDate: parisDay(Date.now()),
  });
});

router.post('/messages/:id/reserver', requireRole('eleve', 'prof'), (req, res) => {
  const conv = conversationFor(parseInt(req.params.id, 10), req.user.id);
  if (!conv) return res.redirect('/messages');
  const tp = tutorProfile(conv.tutor_id);
  const blocker = bookingBlocker(req, conv);
  const v = {
    date: clean(req.body.date, 10), time: clean(req.body.time, 5), duration: parseInt(req.body.duration, 10),
    subject: clean(req.body.subject, 60), mode: clean(req.body.mode, 20), note: clean(req.body.note, 500),
  };
  const errors = {};
  const start = parisToDate(v.date, v.time);
  if (!start) errors.date = 'Date ou heure invalide.';
  else if (start.getTime() < Date.now() + C.MIN_NOTICE_HOURS * HOUR) errors.date = `Le cours doit commencer dans au moins ${C.MIN_NOTICE_HOURS} h.`;
  else if (start.getTime() > Date.now() + 180 * 24 * HOUR) errors.date = 'Réservation possible jusqu\'à 6 mois à l\'avance.';
  if (!C.DURATIONS.includes(v.duration)) errors.duration = 'Durée invalide.';
  if (!split(tp.subjects).includes(v.subject)) errors.subject = 'Matière invalide.';
  if (!split(tp.modes).includes(v.mode)) errors.mode = 'Format invalide.';
  if (!blocker && !Object.keys(errors).length) {
    try {
      const b = B.propose({ conv, by: req.user, start, durationMin: v.duration, subject: v.subject, mode: v.mode, note: v.note, hourlyRate: tp.hourly_rate });
      req.flash('success', 'Proposition envoyée ! Le cours sera confirmé quand l\'autre personne aura accepté le créneau.');
      return res.redirect(`/reservations/${b.id}`);
    } catch (err) {
      errors.date = err.message;
    }
  }
  const other = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(req.user.id === conv.student_id ? conv.tutor_id : conv.student_id);
  res.status(400).render('booking-new', {
    title: 'Réserver un cours', conv, tp, otherName: publicName(other), blocker, v, errors,
    subjects: split(tp.subjects), modes: split(tp.modes), minDate: parisDay(Date.now()),
  });
});

// ---------- Page d'une réservation ----------

router.get('/reservations/:id', requireLogin, (req, res) => {
  const b = bookingFor(parseInt(req.params.id, 10), req.user.id);
  if (!b) return res.status(404).render('error', { title: 'Réservation introuvable', message: "Cette réservation n'existe pas." });
  if (req.query.paiement === 'annule') res.locals.flash = { type: 'info', text: "Paiement annulé : aucun montant n'a été débité. Tu peux réessayer quand tu veux." };
  res.render('booking', { title: 'Réservation', b: viewModel(b, req.user), payMode: payments.MODE });
});

// Raccourci pour toutes les actions : charge la réservation, exécute, gère les erreurs.
const action = (fn, ok) => async (req, res) => {
  const b = bookingFor(parseInt(req.params.id, 10), req.user.id);
  if (!b) return res.redirect('/planning');
  try {
    await fn(req, b);
    if (ok) req.flash('success', ok);
  } catch (err) {
    req.flash('error', err.message);
  }
  res.redirect(`/reservations/${b.id}`);
};

router.post('/reservations/:id/accepter', requireLogin, action(async (req, b) => {
  if (!viewModel(b, req.user).can.accept) throw new Error('Action impossible.');
  const conv = conversationFor(b.conversation_id, req.user.id);
  const blocker = bookingBlocker(req, conv);
  if (blocker) throw new Error(blocker);
  B.accept(b, req.user);
}, 'Créneau confirmé !'));

router.post('/reservations/:id/refuser', requireLogin, action(async (req, b) => {
  if (!viewModel(b, req.user).can.accept) throw new Error('Action impossible.');
  B.refuse(b, req.user);
}, 'Créneau refusé.'));

router.post('/reservations/:id/annuler', requireLogin, action(async (req, b) => {
  const can = viewModel(b, req.user).can;
  if (!can.cancel && !can.withdraw) throw new Error('Ce cours ne peut plus être annulé.');
  await B.cancel(b, req.user, clean(req.body.reason, 300));
}, 'Cours annulé.'));

router.post('/reservations/:id/valider', requireRole('eleve'), action(async (req, b) => {
  if (!viewModel(b, req.user).can.validate) throw new Error('Action impossible.');
  await B.validate(b, 'eleve');
}, 'Merci ! Le cours est validé et le prof va être payé. Tu peux maintenant laisser un avis sur sa fiche.'));

router.post('/reservations/:id/probleme', requireRole('eleve'), action(async (req, b) => {
  const text = clean(req.body.issue, 1000);
  if (text.length < 10) throw new Error('Décris le problème en quelques mots (10 caractères minimum).');
  B.reportIssue(b, req.user, text);
}, 'Problème signalé. Le paiement est bloqué et l\'équipe Relais va te recontacter par e-mail.'));

// ---------- Paiement par carte ----------

router.get('/reservations/:id/payer', requireRole('eleve'), async (req, res) => {
  const b = bookingFor(parseInt(req.params.id, 10), req.user.id);
  if (!b) return res.redirect('/planning');
  if (b.status !== 'confirmee') {
    req.flash(b.status === 'payee' ? 'success' : 'error', b.status === 'payee' ? 'Ce cours est déjà payé.' : 'Ce cours ne peut pas être payé.');
    return res.redirect(`/reservations/${b.id}`);
  }
  if (new Date(b.starts_at).getTime() <= Date.now()) {
    req.flash('error', "L'heure du cours est passée : il ne peut plus être payé.");
    return res.redirect(`/reservations/${b.id}`);
  }
  try {
    const tutor = db.prepare('SELECT first_name FROM users WHERE id = ?').get(b.tutor_id);
    const student = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.user.id);
    const session = await payments.createCheckout(b, student, `Cours de ${b.subject} avec ${tutor.first_name} – ${slotLabel(b)} (${durationLabel(b.duration_min)})`);
    db.prepare('UPDATE bookings SET checkout_session_id = ? WHERE id = ?').run(session.id, b.id);
    res.redirect(303, session.url);
  } catch (err) {
    console.error('[paiement]', err.message);
    req.flash('error', 'Le paiement est momentanément indisponible. Réessaie dans quelques minutes.');
    res.redirect(`/reservations/${b.id}`);
  }
});

router.get('/reservations/:id/paiement/retour', requireRole('eleve'), async (req, res) => {
  const b = bookingFor(parseInt(req.params.id, 10), req.user.id);
  if (!b) return res.redirect('/planning');
  try {
    const sessionId = String(req.query.session_id || '');
    if (sessionId && sessionId === b.checkout_session_id) {
      const r = await payments.checkoutResult(sessionId);
      if (r.paid) B.markPaid(b.id, r);
    }
  } catch (err) {
    console.error('[paiement retour]', err.message);
  }
  const nb = B.get(b.id);
  req.flash(nb.status === 'payee' ? 'success' : 'info', nb.status === 'payee'
    ? 'Paiement confirmé : ton cours est réservé ! L\'argent sera versé au prof après le cours, quand tu l\'auras validé.'
    : 'Paiement en cours de confirmation. Actualise la page dans quelques instants.');
  res.redirect(`/reservations/${b.id}`);
});

// ---------- Planning ----------

router.get('/planning', requireRole('eleve', 'prof'), (req, res) => {
  const today = parisDay(Date.now());
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(req.query.semaine || '') ? req.query.semaine : today);
  const from = toIso(parisToDate(monday, '00:00'));
  const to = toIso(parisToDate(addDays(monday, 7), '00:00'));
  const col = req.user.role === 'prof' ? 'tutor_id' : 'student_id';
  const visible = "('proposee', 'confirmee', 'payee', 'terminee', 'litige')";
  const week = db.prepare(`SELECT * FROM bookings WHERE ${col} = ? AND status IN ${visible} AND starts_at >= ? AND starts_at < ? ORDER BY starts_at`)
    .all(req.user.id, from, to).map((b) => viewModel(b, req.user));

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const ref = parisToDate(day, '12:00');
    return { day, label: parisShortDay(ref), long: parisLongDay(ref), today: day === today, items: week.filter((b) => parisDay(b.starts_at) === day) };
  });

  // Ce qui demande une action de ma part.
  const pending = db.prepare(`SELECT * FROM bookings WHERE ${col} = ? AND status IN ('proposee', 'confirmee', 'payee') ORDER BY starts_at`)
    .all(req.user.id).map((b) => viewModel(b, req.user))
    .filter((b) => b.can.accept || b.can.pay || b.can.validate || (b.status === 'confirmee' && !b.isStudent));
  const upcoming = db.prepare(`SELECT * FROM bookings WHERE ${col} = ? AND status = 'payee' AND starts_at >= ? ORDER BY starts_at LIMIT 8`)
    .all(req.user.id, toIso(new Date())).map((b) => viewModel(b, req.user));

  // Pour un prof : récap des élèves suivis.
  let students = [];
  if (req.user.role === 'prof') {
    students = db.prepare(`SELECT u.id, u.first_name, u.last_name, sp.school_grade, COUNT(b.id) AS lessons,
        SUM(CASE WHEN b.status = 'terminee' THEN 1 ELSE 0 END) AS done, MIN(CASE WHEN b.status = 'payee' AND b.starts_at >= @now THEN b.starts_at END) AS next_at
      FROM bookings b JOIN users u ON u.id = b.student_id LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE b.tutor_id = @me AND b.status IN ('payee', 'terminee', 'litige') GROUP BY u.id ORDER BY next_at IS NULL, next_at`)
      .all({ me: req.user.id, now: toIso(new Date()) }).map((s) => ({ ...s, name: publicName(s), next: s.next_at ? `${parisShortDay(s.next_at)} à ${parisTime(s.next_at)}` : null }));
  }

  res.render('planning', {
    title: 'Mon planning', days, monday, prev: addDays(monday, -7), next: addDays(monday, 7), isThisWeek: monday === mondayOf(today),
    rangeLabel: `${parisShortDay(parisToDate(monday, '12:00'))} – ${parisShortDay(parisToDate(addDays(monday, 6), '12:00'))}`,
    pending, upcoming, students,
  });
});

module.exports = router;
