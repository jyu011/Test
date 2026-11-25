// Stockage des sessions de connexion dans la base SQLite du site.
const session = require('express-session');

class SqliteStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire TEXT NOT NULL)`);
    // Nettoyage des sessions expirées toutes les 15 minutes.
    setInterval(() => this.db.prepare("DELETE FROM sessions WHERE expire < datetime('now')").run(), 15 * 60 * 1000).unref();
  }
  static expiry(sess) {
    const ms = sess && sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 24 * 3600 * 1000;
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  }
  get(sid, cb) {
    try {
      const row = this.db.prepare("SELECT sess FROM sessions WHERE sid = ? AND expire > datetime('now')").get(sid);
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) { cb(err); }
  }
  set(sid, sess, cb = () => {}) {
    try {
      this.db.prepare('INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT (sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire')
        .run(sid, JSON.stringify(sess), SqliteStore.expiry(sess));
      cb(null);
    } catch (err) { cb(err); }
  }
  destroy(sid, cb = () => {}) {
    try { this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); cb(null); } catch (err) { cb(err); }
  }
  touch(sid, sess, cb = () => {}) {
    try { this.db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?').run(SqliteStore.expiry(sess), sid); cb(null); } catch (err) { cb(err); }
  }
}

module.exports = SqliteStore;
