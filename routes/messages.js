const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../lib/db');
const { requireLogin, requireRole } = require('../lib/middleware');
const { publicName, initials, split, frDateTime } = require('../lib/helpers');
const emails = require('../lib/emails');
const B = require('../lib/bookings');
const { slotLabel, euros } = require('../lib/time');

// E-mail au destinataire seulement pour le premier message non lu (évite d'inonder sa boîte).
function notify(conv, sender, body) {
  const recipientId = sender.id === conv.student_id ? conv.tutor_id : conv.student_id;
  const unread = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL').get(conv.id, recipientId).n;
  if (unread !== 1) return;
  const recipient = db.prepare('SELECT id, email, first_name FROM users WHERE id = ?').get(recipientId);
  emails.newMessage(recipient, sender, conv.id, body);
}

const router = express.Router();

const sendLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de messages envoyés, patiente une minute.' } });

const MAX_LEN = 2000;

// Renvoie la conversation seulement si l'utilisateur en fait partie.
function getConversation(id, userId) {
  return db.prepare(`
    SELECT c.*, s.first_name AS s_first, s.last_name AS s_last, p.first_name AS p_first, p.last_name AS p_last,
           tp.photo AS p_photo, tp.field_of_study AS p_field, tp.school AS p_school
    FROM conversations c
    JOIN users s ON s.id = c.student_id
    JOIN users p ON p.id = c.tutor_id
    LEFT JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
    WHERE c.id = ? AND (c.student_id = ? OR c.tutor_id = ?)
  `).get(id, userId, userId);
}

function listConversations(userId) {
  return db.prepare(`
    SELECT c.id, c.student_id, c.tutor_id,
      s.first_name AS s_first, s.last_name AS s_last, p.first_name AS p_first, p.last_name AS p_last, tp.photo AS p_photo,
      (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != @uid AND read_at IS NULL) AS unread
    FROM conversations c
    JOIN users s ON s.id = c.student_id
    JOIN users p ON p.id = c.tutor_id
    LEFT JOIN tutor_profiles tp ON tp.user_id = c.tutor_id
    WHERE c.student_id = @uid OR c.tutor_id = @uid
    ORDER BY last_at DESC
  `).all({ uid: userId }).map((c) => {
    const isStudent = c.student_id === userId;
    const other = isStudent ? { first_name: c.p_first, last_name: c.p_last } : { first_name: c.s_first, last_name: c.s_last };
    return { ...c, otherName: publicName(other), otherInitial: initials(other), otherPhoto: isStudent ? c.p_photo : null };
  });
}

const toJson = (m, me) => ({ id: m.id, body: m.body, mine: m.sender_id === me, at: frDateTime(m.created_at), kind: m.kind, bookingId: m.booking_id });

router.get('/messages', requireLogin, (req, res) => {
  const conversations = listConversations(req.user.id);
  res.render('messages', { title: 'Messagerie', conversations, current: null, messages: [], student: null, bookings: [] });
});

router.get('/messages/:id', requireLogin, (req, res) => {
  const conv = getConversation(parseInt(req.params.id, 10), req.user.id);
  if (!conv) return res.status(404).render('error', { title: 'Conversation introuvable', message: "Cette conversation n'existe pas." });

  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL").run(conv.id, req.user.id);
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').all(conv.id).map((m) => toJson(m, req.user.id));
  res.locals.unread = Math.max(0, res.locals.unread - messages.length);

  // La fiche élève n'est visible que par le prof, ici, dans la messagerie. Jamais l'adresse.
  let student = null;
  if (req.user.id === conv.tutor_id) {
    student = db.prepare(`
      SELECT u.first_name, u.last_name, u.birth_date, u.created_at, sp.account_type, sp.child_first_name, sp.school_grade,
             sp.city, sp.postal_code, sp.subjects, sp.goals
      FROM users u JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = ?
    `).get(conv.student_id);
    if (student) student.subjectList = split(student.subjects);
  }
  const isStudent = req.user.id === conv.student_id;
  const bookings = db.prepare(`SELECT * FROM bookings WHERE conversation_id = ? AND status IN ('proposee', 'confirmee', 'payee', 'litige')
    ORDER BY starts_at`).all(conv.id).map((b) => ({ ...b, when: slotLabel(b), price: euros(b.price_cents), statusLabel: B.STATUS_LABELS[b.status] }));
  const tutorRate = db.prepare('SELECT hourly_rate FROM tutor_profiles WHERE user_id = ?').get(conv.tutor_id);
  const other = isStudent
    ? { name: publicName({ first_name: conv.p_first, last_name: conv.p_last }), photo: conv.p_photo, sub: `${conv.p_field} · ${conv.p_school}`, link: `/profs/${conv.tutor_id}` }
    : { name: publicName({ first_name: conv.s_first, last_name: conv.s_last }), photo: null, sub: student ? student.school_grade : '', link: null };
  other.initial = other.name.charAt(0);

  res.render('messages', {
    title: `Messages – ${other.name}`,
    conversations: listConversations(req.user.id),
    current: conv, other, messages, student, bookings, tutorRate: tutorRate ? tutorRate.hourly_rate : null,
  });
});

// Nouvelles conversations : seul un élève peut contacter un prof vérifié.
router.post('/profs/:id/contacter', requireRole('eleve'), sendLimiter, (req, res) => {
  const tutorId = parseInt(req.params.id, 10);
  const tutor = db.prepare("SELECT user_id FROM tutor_profiles WHERE user_id = ? AND status = 'verifie'").get(tutorId);
  const body = String(req.body.body || '').trim().slice(0, MAX_LEN);
  if (!tutor) return res.redirect('/profs');
  if (!db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.user.id).email_verified) {
    req.flash('error', "Confirme d'abord ton adresse e-mail (lien envoyé à l'inscription, ou renvoie-le depuis « Mon compte »).");
    return res.redirect(`/profs/${tutorId}#contact`);
  }
  if (body.length < 2) {
    req.flash('error', 'Écris un message avant de l\'envoyer.');
    return res.redirect(`/profs/${tutorId}#contact`);
  }
  const convId = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO conversations (student_id, tutor_id) VALUES (?, ?)').run(req.user.id, tutorId);
    const conv = db.prepare('SELECT id FROM conversations WHERE student_id = ? AND tutor_id = ?').get(req.user.id, tutorId);
    db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(conv.id, req.user.id, body);
    return conv.id;
  })();
  notify(db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId), req.user, body);
  res.redirect(`/messages/${convId}`);
});

// Envoi d'un message (formulaire classique ou JavaScript).
router.post('/messages/:id', requireLogin, sendLimiter, (req, res) => {
  const conv = getConversation(parseInt(req.params.id, 10), req.user.id);
  const wantsJson = req.get('accept')?.includes('application/json');
  if (!conv) return wantsJson ? res.status(404).json({ error: 'Conversation introuvable' }) : res.redirect('/messages');
  const body = String(req.body.body || '').trim().slice(0, MAX_LEN);
  if (!body) return wantsJson ? res.status(400).json({ error: 'Message vide' }) : res.redirect(`/messages/${conv.id}`);
  const { lastInsertRowid } = db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(conv.id, req.user.id, body);
  notify(conv, req.user, body);
  if (wantsJson) {
    const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid);
    return res.json({ message: toJson(m, req.user.id) });
  }
  res.redirect(`/messages/${conv.id}#bas`);
});

// Récupère les nouveaux messages (rafraîchissement automatique toutes les quelques secondes).
router.get('/messages/:id/nouveaux', requireLogin, (req, res) => {
  const conv = getConversation(parseInt(req.params.id, 10), req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });
  const after = parseInt(req.query.apres, 10) || 0;
  const rows = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id').all(conv.id, after);
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL").run(conv.id, req.user.id);
  res.json({ messages: rows.map((m) => toJson(m, req.user.id)) });
});

module.exports = router;
