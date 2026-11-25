const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db } = require('../lib/db');
const { upload, deleteUpload, split } = require('../lib/helpers');
const { validateIdentity, validateStudent, validateTutor } = require('../lib/validate');
const { requireLogin, requireRole } = require('../lib/middleware');
const C = require('../lib/constants');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).render('error', { title: 'Trop de tentatives', message: 'Patiente quelques minutes avant de réessayer.' }) });

const tutorUploads = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'gallery', maxCount: 4 },
  { name: 'certificate', maxCount: 1 },
]);

// Gère les erreurs d'upload (fichier trop lourd, mauvais format) sans planter la page.
function withUploads(req, res, next) {
  tutorUploads(req, res, (err) => {
    if (err) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (5 Mo maximum).' : err.message;
      req.body = req.body || {};
    }
    next();
  });
}

function cleanupFiles(files) {
  if (!files) return;
  for (const [field, list] of Object.entries(files)) {
    list.forEach((f) => deleteUpload(f.filename, field === 'certificate'));
  }
}

function login(req, userId, cb) {
  req.session.regenerate((err) => {
    if (err) return cb(err);
    req.session.userId = userId;
    cb();
  });
}

const formLocals = { C, split };

// ---------- Mon compte ----------

router.get('/compte', (req, res) => {
  if (!req.user) return res.render('account-choice', { title: 'Mon compte' });
  if (req.user.role === 'admin') return res.redirect('/admin');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const profile = req.user.role === 'prof'
    ? db.prepare('SELECT * FROM tutor_profiles WHERE user_id = ?').get(u.id)
    : db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(u.id);
  const stats = req.user.role === 'prof'
    ? db.prepare('SELECT ROUND(AVG(rating),1) AS rating, COUNT(*) AS n FROM reviews WHERE tutor_id = ?').get(u.id)
    : null;
  const convCount = db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE student_id = ? OR tutor_id = ?').get(u.id, u.id).n;
  res.render('account', { title: 'Mon compte', u, profile, stats, convCount, ...formLocals });
});

// ---------- Connexion ----------

router.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/compte');
  res.render('login', { title: 'Connexion', email: '', error: null });
});

router.post('/connexion', authLimiter, (req, res, next) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).render('login', { title: 'Connexion', email, error: 'E-mail ou mot de passe incorrect.' });
  }
  const returnTo = req.session.returnTo;
  login(req, user.id, (err) => {
    if (err) return next(err);
    res.redirect(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/compte');
  });
});

router.post('/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Inscription élève ----------

router.get('/inscription/eleve', (req, res) => {
  res.render('signup-student', { title: 'Créer un compte élève', v: {}, errors: {}, ...formLocals });
});

router.post('/inscription/eleve', authLimiter, (req, res, next) => {
  const errors = {};
  const identity = validateIdentity(req.body, errors, { withPassword: true });
  const student = validateStudent(req.body, errors, identity);
  if (!errors.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(identity.email)) {
    errors.email = 'Un compte existe déjà avec cet e-mail.';
  }
  if (Object.keys(errors).length) {
    return res.status(400).render('signup-student', { title: 'Créer un compte élève', v: { ...req.body, ...identity, ...student, password: '' }, errors, ...formLocals });
  }
  const create = db.transaction(() => {
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO users (role, email, password_hash, first_name, last_name, birth_date, phone)
      VALUES ('eleve', @email, @hash, @first_name, @last_name, @birth_date, @phone)
    `).run({ ...identity, hash: bcrypt.hashSync(identity.password, 12) });
    db.prepare(`
      INSERT INTO student_profiles (user_id, account_type, child_first_name, school_grade, address, postal_code, city, subjects, goals, parent_email, parent_consent)
      VALUES (@id, @account_type, @child_first_name, @school_grade, @address, @postal_code, @city, @subjects, @goals, @parent_email, @parent_consent)
    `).run({ id, ...student });
    return id;
  });
  const id = create();
  login(req, id, (err) => {
    if (err) return next(err);
    req.flash('success', 'Bienvenue sur Relais ! Ton compte est créé.');
    const returnTo = req.session.returnTo;
    res.redirect(returnTo && returnTo.startsWith('/profs') ? returnTo : '/profs');
  });
});

// ---------- Inscription prof ----------

router.get('/inscription/prof', (req, res) => {
  res.render('signup-tutor', { title: 'Devenir prof sur Relais', v: {}, errors: {}, ...formLocals });
});

router.post('/inscription/prof', authLimiter, withUploads, (req, res, next) => {
  const errors = {};
  const identity = validateIdentity(req.body, errors, { withPassword: true });
  const tutor = validateTutor(req.body, errors, identity);
  const files = req.files || {};
  if (req.uploadError) errors.files = req.uploadError;
  if (!files.certificate) errors.certificate = 'Le certificat de scolarité (ou une preuve d\'inscription) est obligatoire.';
  if (!files.photo) errors.photo = 'Une photo de profil est obligatoire.';
  if (!errors.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(identity.email)) {
    errors.email = 'Un compte existe déjà avec cet e-mail.';
  }
  if (Object.keys(errors).length) {
    cleanupFiles(files);
    return res.status(400).render('signup-tutor', { title: 'Devenir prof sur Relais', v: { ...req.body, ...identity, ...tutor, password: '' }, errors, ...formLocals });
  }
  const create = db.transaction(() => {
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO users (role, email, password_hash, first_name, last_name, birth_date, phone)
      VALUES ('prof', @email, @hash, @first_name, @last_name, @birth_date, @phone)
    `).run({ ...identity, hash: bcrypt.hashSync(identity.password, 12) });
    db.prepare(`
      INSERT INTO tutor_profiles (user_id, school, school_city, field_of_study, study_year, address, postal_code, city, radius_km,
        modes, subjects, levels, hourly_rate, headline, description, photo, certificate)
      VALUES (@id, @school, @school_city, @field_of_study, @study_year, @address, @postal_code, @city, @radius_km,
        @modes, @subjects, @levels, @hourly_rate, @headline, @description, @photo, @certificate)
    `).run({ id, ...tutor, photo: files.photo[0].filename, certificate: files.certificate[0].filename });
    const addPhoto = db.prepare('INSERT INTO tutor_photos (user_id, filename) VALUES (?, ?)');
    (files.gallery || []).forEach((f) => addPhoto.run(id, f.filename));
    return id;
  });
  const id = create();
  login(req, id, (err) => {
    if (err) return next(err);
    req.flash('success', "Ton profil est créé ! Il sera visible par les élèves dès que ton certificat de scolarité aura été vérifié.");
    res.redirect('/compte');
  });
});

// ---------- Modifier son profil ----------

router.get('/compte/modifier', requireRole('eleve', 'prof'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (req.user.role === 'prof') {
    const p = db.prepare('SELECT * FROM tutor_profiles WHERE user_id = ?').get(u.id);
    const photos = db.prepare('SELECT * FROM tutor_photos WHERE user_id = ?').all(u.id);
    return res.render('edit-tutor', { title: 'Modifier mon profil', v: { ...u, ...p }, photos, errors: {}, ...formLocals });
  }
  const p = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(u.id);
  res.render('edit-student', { title: 'Modifier mon profil', v: { ...u, ...p }, errors: {}, ...formLocals });
});

router.post('/compte/modifier', requireRole('eleve', 'prof'), withUploads, (req, res) => {
  const errors = {};
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const identity = validateIdentity(req.body, errors, { withPassword: false });
  if (!errors.email && identity.email !== current.email
      && db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(identity.email, current.id)) {
    errors.email = 'Cet e-mail est déjà utilisé.';
  }
  const files = req.files || {};
  if (req.uploadError) errors.files = req.uploadError;

  if (req.user.role === 'eleve') {
    const student = validateStudent(req.body, errors, identity);
    if (Object.keys(errors).length) {
      return res.status(400).render('edit-student', { title: 'Modifier mon profil', v: { ...req.body, ...identity, ...student }, errors, ...formLocals });
    }
    db.transaction(() => {
      db.prepare('UPDATE users SET email=@email, first_name=@first_name, last_name=@last_name, birth_date=@birth_date, phone=@phone WHERE id=@id').run({ ...identity, id: current.id });
      db.prepare(`UPDATE student_profiles SET account_type=@account_type, child_first_name=@child_first_name, school_grade=@school_grade,
        address=@address, postal_code=@postal_code, city=@city, subjects=@subjects, goals=@goals, parent_email=@parent_email,
        parent_consent=@parent_consent WHERE user_id=@id`).run({ ...student, id: current.id });
    })();
  } else {
    const tutor = validateTutor(req.body, errors, identity);
    const existing = db.prepare('SELECT * FROM tutor_profiles WHERE user_id = ?').get(current.id);
    const photos = db.prepare('SELECT * FROM tutor_photos WHERE user_id = ?').all(current.id);
    const removeIds = [].concat(req.body.remove_photo || []).map(Number);
    const kept = photos.filter((p) => !removeIds.includes(p.id));
    if (kept.length + (files.gallery || []).length > 4) errors.gallery = '4 photos maximum dans la galerie.';
    if (Object.keys(errors).length) {
      cleanupFiles(files);
      return res.status(400).render('edit-tutor', { title: 'Modifier mon profil', v: { ...existing, ...req.body, ...identity, ...tutor }, photos, errors, ...formLocals });
    }
    db.transaction(() => {
      db.prepare('UPDATE users SET email=@email, first_name=@first_name, last_name=@last_name, birth_date=@birth_date, phone=@phone WHERE id=@id').run({ ...identity, id: current.id });
      db.prepare(`UPDATE tutor_profiles SET school=@school, school_city=@school_city, field_of_study=@field_of_study, study_year=@study_year,
        address=@address, postal_code=@postal_code, city=@city, radius_km=@radius_km, modes=@modes, subjects=@subjects, levels=@levels,
        hourly_rate=@hourly_rate, headline=@headline, description=@description WHERE user_id=@id`).run({ ...tutor, id: current.id });
      if (files.photo) {
        db.prepare('UPDATE tutor_profiles SET photo = ? WHERE user_id = ?').run(files.photo[0].filename, current.id);
        deleteUpload(existing.photo);
      }
      if (files.certificate) {
        // Nouveau justificatif = nouvelle vérification.
        db.prepare("UPDATE tutor_profiles SET certificate = ?, status = 'en_attente', status_note = NULL WHERE user_id = ?").run(files.certificate[0].filename, current.id);
        deleteUpload(existing.certificate, true);
      }
      for (const p of photos.filter((p) => removeIds.includes(p.id))) {
        db.prepare('DELETE FROM tutor_photos WHERE id = ? AND user_id = ?').run(p.id, current.id);
        deleteUpload(p.filename);
      }
      const addPhoto = db.prepare('INSERT INTO tutor_photos (user_id, filename) VALUES (?, ?)');
      (files.gallery || []).forEach((f) => addPhoto.run(current.id, f.filename));
    })();
  }
  req.flash('success', 'Profil enregistré.');
  res.redirect('/compte');
});

router.post('/compte/mot-de-passe', requireLogin, (req, res) => {
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const next = String(req.body.new_password || '');
  if (!bcrypt.compareSync(String(req.body.current_password || ''), u.password_hash)) {
    req.flash('error', 'Mot de passe actuel incorrect.');
  } else if (next.length < 8) {
    req.flash('error', 'Le nouveau mot de passe doit faire au moins 8 caractères.');
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 12), req.user.id);
    req.flash('success', 'Mot de passe modifié.');
  }
  res.redirect('/compte');
});

// Suppression du compte (droit à l'effacement, RGPD).
router.post('/compte/supprimer', requireRole('eleve', 'prof'), (req, res) => {
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    req.flash('error', 'Mot de passe incorrect : compte non supprimé.');
    return res.redirect('/compte');
  }
  const t = db.prepare('SELECT photo, certificate FROM tutor_profiles WHERE user_id = ?').get(req.user.id);
  const photos = db.prepare('SELECT filename FROM tutor_photos WHERE user_id = ?').all(req.user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  if (t) { deleteUpload(t.photo); deleteUpload(t.certificate, true); }
  photos.forEach((p) => deleteUpload(p.filename));
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Avis ----------

router.post('/profs/:id/avis', requireRole('eleve'), (req, res) => {
  const tutorId = parseInt(req.params.id, 10);
  const conv = db.prepare('SELECT id FROM conversations WHERE student_id = ? AND tutor_id = ?').get(req.user.id, tutorId);
  const tutorReplied = conv && db.prepare('SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ?').get(conv.id, tutorId);
  const rating = parseInt(req.body.rating, 10);
  const comment = String(req.body.comment || '').trim().slice(0, 1500);
  if (!tutorReplied) {
    req.flash('error', 'Tu peux laisser un avis après avoir échangé avec ce prof.');
  } else if (!(rating >= 1 && rating <= 5) || comment.length < 10) {
    req.flash('error', 'Choisis une note et écris au moins 10 caractères.');
  } else {
    db.prepare(`INSERT INTO reviews (tutor_id, student_id, rating, comment) VALUES (?, ?, ?, ?)
      ON CONFLICT (tutor_id, student_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = datetime('now')`)
      .run(tutorId, req.user.id, rating, comment);
    req.flash('success', 'Merci pour ton avis !');
  }
  res.redirect(`/profs/${tutorId}#avis`);
});

module.exports = router;
