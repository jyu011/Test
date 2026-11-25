const { db } = require('./db');

// Requête commune : profil prof vérifié + note moyenne + nombre d'avis.
const BASE = `
  SELECT u.id, u.first_name, u.last_name, u.birth_date, t.*,
         ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS review_count
  FROM users u
  JOIN tutor_profiles t ON t.user_id = u.id
  LEFT JOIN reviews r ON r.tutor_id = u.id
`;

function searchTutors({ subject, level, place, mode, maxPrice, sort }) {
  const where = ["t.status = 'verifie'"];
  const params = {};
  if (subject) { where.push("('|' || t.subjects || '|') LIKE @subject"); params.subject = `%|${subject}|%`; }
  if (level) { where.push("('|' || t.levels || '|') LIKE @level"); params.level = `%|${level}|%`; }
  if (mode) { where.push("('|' || t.modes || '|') LIKE @mode"); params.mode = `%|${mode}|%`; }
  if (maxPrice) { where.push('t.hourly_rate <= @maxPrice'); params.maxPrice = maxPrice; }
  if (place) {
    // Code postal : on cherche dans le même département (2 premiers chiffres).
    if (/^\d{2,5}$/.test(place)) {
      where.push('t.postal_code LIKE @dep');
      params.dep = `${place.slice(0, 2)}%`;
    } else {
      where.push('t.city LIKE @city');
      params.city = `%${place}%`;
    }
  }
  const order = {
    prix: 't.hourly_rate ASC',
    prix_desc: 't.hourly_rate DESC',
    recent: 'u.created_at DESC',
  }[sort] || 'rating IS NULL, rating DESC, review_count DESC';

  return db.prepare(`${BASE} WHERE ${where.join(' AND ')} GROUP BY u.id ORDER BY ${order}`).all(params);
}

function getTutor(id, { onlyVerified = true } = {}) {
  const row = db.prepare(`${BASE} WHERE u.id = ? ${onlyVerified ? "AND t.status = 'verifie'" : ''} GROUP BY u.id`).get(id);
  return row && row.user_id ? row : null;
}

module.exports = { searchTutors, getTutor };
