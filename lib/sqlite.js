// Petite couche d'adaptation autour de la base SQLite intégrée à Node.js (node:sqlite).
// Avantage : aucune compilation nécessaire à l'installation, sur Windows comme sur Mac ou Linux.
// Elle reproduit les quelques fonctions utilisées par le site (prepare/run/get/all, transaction, pragma).
const { DatabaseSync } = require('node:sqlite');

const NAMED = /[@:$]([A-Za-z_][A-Za-z0-9_]*)/g;

// Les paramètres nommés : on ne garde que ceux présents dans la requête, et undefined devient NULL.
function bindArgs(names, args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Uint8Array)) {
    const out = {};
    for (const n of names) out[n] = args[0][n] === undefined ? null : args[0][n];
    return [out];
  }
  return args.map((v) => (v === undefined ? null : v));
}

class Statement {
  constructor(stmt, sql) {
    this.stmt = stmt;
    this.names = [...new Set([...sql.replace(/'[^']*'/g, '').matchAll(NAMED)].map((m) => m[1]))];
  }
  run(...args) {
    const r = this.stmt.run(...bindArgs(this.names, args));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
  get(...args) {
    const row = this.stmt.get(...bindArgs(this.names, args));
    return row ? { ...row } : undefined;
  }
  all(...args) {
    return this.stmt.all(...bindArgs(this.names, args)).map((row) => ({ ...row }));
  }
}

class Database {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.depth = 0;
  }
  exec(sql) { this.db.exec(sql); }
  pragma(str) { this.db.exec(`PRAGMA ${str}`); }
  prepare(sql) { return new Statement(this.db.prepare(sql), sql); }
  // Renvoie une fonction qui exécute `fn` dans une transaction (tout ou rien).
  transaction(fn) {
    return (...args) => {
      if (this.depth > 0) return fn(...args);
      this.db.exec('BEGIN');
      this.depth++;
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      } finally {
        this.depth--;
      }
    };
  }
}

module.exports = Database;
