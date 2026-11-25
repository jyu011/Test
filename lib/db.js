const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'relais.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('eleve', 'prof', 'admin')),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fiche élève : visible uniquement par les profs avec qui l'élève discute.
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'eleve' CHECK (account_type IN ('eleve', 'parent')),
  child_first_name TEXT,
  school_grade TEXT,
  address TEXT,            -- privé, jamais affiché
  postal_code TEXT,
  city TEXT,
  subjects TEXT,           -- liste séparée par "|"
  goals TEXT,
  parent_email TEXT,
  parent_consent INTEGER NOT NULL DEFAULT 0
);

-- Fiche prof (étudiant).
CREATE TABLE IF NOT EXISTS tutor_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school TEXT NOT NULL,
  school_city TEXT,
  field_of_study TEXT NOT NULL,
  study_year TEXT NOT NULL,
  address TEXT,            -- privé, jamais affiché
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  radius_km INTEGER NOT NULL DEFAULT 5,
  modes TEXT NOT NULL,     -- "|"-séparé : domicile, chez_prof, en_ligne
  subjects TEXT NOT NULL,  -- "|"-séparé
  levels TEXT NOT NULL,    -- "|"-séparé : primaire, college, lycee
  hourly_rate INTEGER NOT NULL,
  headline TEXT NOT NULL,
  description TEXT NOT NULL,
  photo TEXT,              -- nom de fichier dans uploads/public
  certificate TEXT,        -- nom de fichier dans uploads/private (admin uniquement)
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'verifie', 'refuse')),
  status_note TEXT
);

CREATE TABLE IF NOT EXISTS tutor_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, tutor_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tutor_id, student_id)
);
`);

module.exports = { db, DATA_DIR };
