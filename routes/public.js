const express = require('express');
const { db } = require('../lib/db');
const { searchTutors, getTutor } = require('../lib/tutors');
const { SUBJECTS, LEVELS, MODES } = require('../lib/constants');
const { clean } = require('../lib/helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const featured = searchTutors({}).slice(0, 3);
  const count = db.prepare("SELECT COUNT(*) AS n FROM tutor_profiles WHERE status = 'verifie'").get().n;
  res.render('home', { title: null, featured, count, SUBJECTS });
});

router.get('/profs', (req, res) => {
  const filters = {
    subject: SUBJECTS.includes(req.query.matiere) ? req.query.matiere : '',
    level: LEVELS[req.query.niveau] ? req.query.niveau : '',
    mode: MODES[req.query.mode] ? req.query.mode : '',
    place: clean(req.query.lieu, 60),
    maxPrice: parseInt(req.query.prix_max, 10) || '',
    sort: clean(req.query.tri, 20),
  };
  const tutors = searchTutors(filters);
  res.render('tutors', { title: 'Trouver un prof', tutors, filters, SUBJECTS, LEVELS, MODES });
});

router.get('/profs/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  // L'admin et le prof lui-même peuvent voir une fiche pas encore vérifiée (aperçu).
  const canPreview = req.user && (req.user.role === 'admin' || req.user.id === id);
  const tutor = getTutor(id, { onlyVerified: !canPreview });
  if (!tutor) return res.status(404).render('error', { title: 'Profil introuvable', message: "Ce prof n'existe pas ou n'est plus disponible." });

  const photos = db.prepare('SELECT filename FROM tutor_photos WHERE user_id = ? ORDER BY id').all(id);
  const reviews = db.prepare(`
    SELECT r.*, u.first_name, u.last_name FROM reviews r JOIN users u ON u.id = r.student_id
    WHERE r.tutor_id = ? ORDER BY r.created_at DESC
  `).all(id);

  let conversation = null;
  let canReview = false;
  let myReview = null;
  if (req.user && req.user.role === 'eleve') {
    conversation = db.prepare('SELECT id FROM conversations WHERE student_id = ? AND tutor_id = ?').get(req.user.id, id);
    // Pour éviter les faux avis : il faut avoir échangé avec le prof et qu'il ait répondu.
    if (conversation) {
      canReview = !!db.prepare('SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ?').get(conversation.id, id);
    }
    myReview = reviews.find((r) => r.student_id === req.user.id) || null;
  }

  const stars = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));
  res.render('tutor', {
    title: `${tutor.first_name} – ${tutor.field_of_study}`,
    tutor, photos, reviews, stars, conversation, canReview, myReview, preview: tutor.status !== 'verifie',
  });
});

router.get('/devenir-prof', (req, res) => res.render('become-tutor', { title: 'Donner des cours' }));
router.get('/mentions-legales', (req, res) => res.render('legal', { title: 'Mentions légales', page: 'mentions' }));
router.get('/cgu', (req, res) => res.render('legal', { title: "Conditions générales d'utilisation", page: 'cgu' }));
router.get('/confidentialite', (req, res) => res.render('legal', { title: 'Politique de confidentialité', page: 'confidentialite' }));

module.exports = router;
