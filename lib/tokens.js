// Jetons à usage unique envoyés par e-mail. Seul leur hash SHA-256 est enregistré.
const crypto = require('crypto');
const { db } = require('./db');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function create(userId, type, hours) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('UPDATE tokens SET used = 1 WHERE user_id = ? AND type = ? AND used = 0').run(userId, type);
  db.prepare("INSERT INTO tokens (token_hash, user_id, type, expires_at) VALUES (?, ?, ?, datetime('now', ?))")
    .run(hash(token), userId, type, `+${hours} hours`);
  return token;
}

// Renvoie l'utilisateur si le jeton est valide (sans le consommer).
function check(token, type) {
  if (!token || typeof token !== 'string') return null;
  return db.prepare(`SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.type = ? AND t.used = 0 AND t.expires_at > datetime('now')`).get(hash(token), type) || null;
}

const consume = (token) => db.prepare('UPDATE tokens SET used = 1 WHERE token_hash = ?').run(hash(token));

module.exports = { create, check, consume };
