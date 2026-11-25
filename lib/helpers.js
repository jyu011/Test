const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { DATA_DIR } = require('./db');
const { LEVELS, MODES } = require('./constants');

const UPLOAD_PUBLIC = path.join(DATA_DIR, 'uploads', 'public');
const UPLOAD_PRIVATE = path.join(DATA_DIR, 'uploads', 'private');
fs.mkdirSync(UPLOAD_PUBLIC, { recursive: true });
fs.mkdirSync(UPLOAD_PRIVATE, { recursive: true });

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const CERT_TYPES = { ...IMAGE_TYPES, 'application/pdf': '.pdf' };

// Photos -> dossier public ; certificats de scolarité -> dossier privé.
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, file.fieldname === 'certificate' ? UPLOAD_PRIVATE : UPLOAD_PUBLIC);
  },
  filename(req, file, cb) {
    const types = file.fieldname === 'certificate' ? CERT_TYPES : IMAGE_TYPES;
    cb(null, crypto.randomBytes(16).toString('hex') + types[file.mimetype]);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter(req, file, cb) {
    const types = file.fieldname === 'certificate' ? CERT_TYPES : IMAGE_TYPES;
    if (types[file.mimetype]) return cb(null, true);
    const err = new Error(file.fieldname === 'certificate'
      ? 'Le certificat doit être un PDF, JPG, PNG ou WEBP.'
      : 'Les photos doivent être au format JPG, PNG ou WEBP.');
    err.code = 'BAD_FILE_TYPE';
    cb(err);
  },
});

function deleteUpload(filename, isPrivate = false) {
  if (!filename) return;
  const file = path.join(isPrivate ? UPLOAD_PRIVATE : UPLOAD_PUBLIC, path.basename(filename));
  fs.promises.unlink(file).catch(() => {});
}

const split = (v) => (v ? String(v).split('|').filter(Boolean) : []);
const asArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const join = (arr) => asArray(arr).map((s) => String(s).trim()).filter(Boolean).join('|');
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function ageFrom(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// "Léa Martin" -> "Léa M." : on n'affiche jamais le nom complet publiquement.
const publicName = (u) => `${u.first_name} ${(u.last_name || '').charAt(0).toUpperCase()}.`;
const initials = (u) => (u.first_name || '?').charAt(0).toUpperCase();

const levelLabels = (levels) => split(levels).map((l) => LEVELS[l]).filter(Boolean);
const modeLabels = (modes) => split(modes).map((m) => MODES[m]).filter(Boolean);

function frDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function frDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Affiche le message d'erreur d'un champ de formulaire (à utiliser avec <%- %>).
const fieldError = (errors, key) => (errors && errors[key] ? `<span class="field-error" id="err-${key}">${esc(errors[key])}</span>` : '');
const has = (list, value) => split(Array.isArray(list) ? list.join('|') : list).includes(value);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTAL_RE = /^\d{5}$/;

module.exports = {
  upload, deleteUpload, UPLOAD_PUBLIC, UPLOAD_PRIVATE,
  split, join, asArray, clean, ageFrom, publicName, initials,
  levelLabels, modeLabels, fieldError, has, esc, frDate, frDateTime, EMAIL_RE, POSTAL_RE,
};
