// Crée (ou réinitialise) un compte administrateur.
// Usage : npm run create-admin -- email@exemple.fr MotDePasseSolide
const bcrypt = require('bcryptjs');
const { db } = require('../lib/db');

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Usage : npm run create-admin -- email@exemple.fr MotDePasse (10 caractères minimum)');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?").run(hash, existing.id);
} else {
  db.prepare("INSERT INTO users (role, email, password_hash, first_name, last_name) VALUES ('admin', ?, ?, 'Admin', 'Relais')").run(email.toLowerCase(), hash);
}
console.log(`Compte admin prêt : ${email}`);
