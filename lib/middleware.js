const crypto = require('crypto');
const { db } = require('./db');

// Charge l'utilisateur connecté et quelques infos utiles à toutes les pages.
function loadUser(req, res, next) {
  res.locals.user = null;
  res.locals.unread = 0;
  if (req.session.userId) {
    const user = db.prepare('SELECT id, role, email, first_name, last_name FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.user = user;
      res.locals.unread = db.prepare(`
        SELECT COUNT(*) AS n FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE (c.student_id = ? OR c.tutor_id = ?) AND m.sender_id != ? AND m.read_at IS NULL
      `).get(user.id, user.id, user.id).n;
    } else {
      delete req.session.userId;
    }
  }
  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/connexion');
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/connexion');
  }
  if (roles.includes(req.user.role)) return next();
  res.status(403).render('error', { title: 'Accès refusé', message: "Cette page n'est pas accessible avec ton type de compte." });
};

// Protection CSRF : un jeton secret par session, à renvoyer avec chaque formulaire.
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.query._csrf || req.get('x-csrf-token');
  const ok = typeof sent === 'string' && sent.length === req.session.csrf.length
    && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrf));
  if (ok) return next();
  res.status(403).render('error', { title: 'Session expirée', message: 'Le formulaire a expiré. Recharge la page et réessaie.' });
}

// Messages "flash" affichés une seule fois (ex. "Profil enregistré").
function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  req.flash = (type, text) => { req.session.flash = { type, text }; };
  next();
}

module.exports = { loadUser, requireLogin, requireRole, csrf, flash };
