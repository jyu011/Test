const express = require('express');
const path = require('path');
const { db } = require('../lib/db');
const { requireRole } = require('../lib/middleware');
const { UPLOAD_PRIVATE } = require('../lib/helpers');
const emails = require('../lib/emails');
const B = require('../lib/bookings');
const { slotLabel, euros } = require('../lib/time');

const router = express.Router();
router.use('/admin', requireRole('admin'));

router.get('/admin', (req, res) => {
  const tutors = db.prepare(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.birth_date, u.created_at, t.*
    FROM users u JOIN tutor_profiles t ON t.user_id = u.id
    ORDER BY CASE t.status WHEN 'en_attente' THEN 0 WHEN 'refuse' THEN 1 ELSE 2 END, u.created_at DESC
  `).all();
  const counts = db.prepare("SELECT (SELECT COUNT(*) FROM users WHERE role='eleve') AS eleves, (SELECT COUNT(*) FROM users WHERE role='prof') AS profs, (SELECT COUNT(*) FROM messages) AS messages, (SELECT COUNT(*) FROM reviews) AS avis").get();
  const reviews = db.prepare(`SELECT r.*, s.first_name AS s_first, s.last_name AS s_last, p.first_name AS p_first, p.last_name AS p_last
    FROM reviews r JOIN users s ON s.id = r.student_id JOIN users p ON p.id = r.tutor_id ORDER BY r.created_at DESC LIMIT 30`).all();
  const bookingRows = db.prepare(`SELECT b.*, s.first_name AS s_first, s.last_name AS s_last, p.first_name AS p_first, p.last_name AS p_last
    FROM bookings b JOIN users s ON s.id = b.student_id JOIN users p ON p.id = b.tutor_id
    WHERE b.status IN ('litige', 'payee', 'terminee', 'remboursee') ORDER BY CASE WHEN b.status = 'litige' THEN 0 WHEN b.payout_status IN ('en_attente', 'erreur') THEN 1 ELSE 2 END, b.starts_at DESC LIMIT 60`).all()
    .map((b) => ({ ...b, when: slotLabel(b), price: euros(b.price_cents), commission: euros(b.commission_cents), tutorAmount: euros(b.tutor_amount_cents), statusLabel: B.STATUS_LABELS[b.status] }));
  const money = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN status IN ('payee', 'litige') THEN price_cents END), 0) AS held,
      COALESCE(SUM(CASE WHEN status = 'terminee' THEN commission_cents END), 0) AS commission,
      COALESCE(SUM(CASE WHEN status = 'terminee' AND payout_status = 'verse' THEN tutor_amount_cents END), 0) AS paidOut
    FROM bookings`).get();
  res.render('admin', { title: 'Administration', tutors, counts, reviews, bookings: bookingRows,
    money: { held: euros(money.held), commission: euros(money.commission), paidOut: euros(money.paidOut) } });
});

// Le certificat n'est jamais public : seul l'admin peut l'ouvrir.
router.get('/admin/certificat/:id', (req, res) => {
  const t = db.prepare('SELECT certificate FROM tutor_profiles WHERE user_id = ?').get(parseInt(req.params.id, 10));
  if (!t || !t.certificate) return res.status(404).send('Aucun certificat');
  res.sendFile(path.join(UPLOAD_PRIVATE, path.basename(t.certificate)));
});

router.post('/admin/profs/:id/statut', (req, res) => {
  const status = ['verifie', 'refuse', 'en_attente'].includes(req.body.status) ? req.body.status : null;
  if (status) {
    const id = parseInt(req.params.id, 10);
    const note = String(req.body.note || '').trim().slice(0, 300) || null;
    const before = db.prepare('SELECT status FROM tutor_profiles WHERE user_id = ?').get(id);
    db.prepare('UPDATE tutor_profiles SET status = ?, status_note = ? WHERE user_id = ?').run(status, note, id);
    if (before && before.status !== status && status !== 'en_attente') {
      emails.tutorStatus(db.prepare('SELECT id, email, first_name FROM users WHERE id = ?').get(id), status, note);
    }
    req.flash('success', 'Statut mis à jour.');
  }
  res.redirect('/admin');
});

router.post('/admin/avis/:id/supprimer', (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(parseInt(req.params.id, 10));
  req.flash('success', 'Avis supprimé.');
  res.redirect('/admin');
});

// Litiges : rembourser l'élève ou payer le prof.
router.post('/admin/reservations/:id/:decision', async (req, res) => {
  const b = B.get(parseInt(req.params.id, 10));
  try {
    if (!b) throw new Error('Réservation introuvable.');
    if (req.params.decision === 'rembourser') await B.adminRefund(b);
    else if (req.params.decision === 'payer') await B.validate(b, 'admin');
    else if (req.params.decision === 'reverser') await B.payout(b);
    else throw new Error('Action inconnue.');
    req.flash('success', 'Décision appliquée.');
  } catch (err) {
    req.flash('error', err.message);
  }
  res.redirect('/admin#litiges');
});

module.exports = router;
