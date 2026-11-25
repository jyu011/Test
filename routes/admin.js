const express = require('express');
const path = require('path');
const { db } = require('../lib/db');
const { requireRole } = require('../lib/middleware');
const { UPLOAD_PRIVATE, deleteUpload } = require('../lib/helpers');

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
  res.render('admin', { title: 'Administration', tutors, counts, reviews });
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
    db.prepare('UPDATE tutor_profiles SET status = ?, status_note = ? WHERE user_id = ?')
      .run(status, String(req.body.note || '').trim().slice(0, 300) || null, parseInt(req.params.id, 10));
    req.flash('success', 'Statut mis à jour.');
  }
  res.redirect('/admin');
});

router.post('/admin/avis/:id/supprimer', (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(parseInt(req.params.id, 10));
  req.flash('success', 'Avis supprimé.');
  res.redirect('/admin');
});

module.exports = router;
