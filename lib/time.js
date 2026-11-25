// Dates et heures : tout est stocké en UTC et affiché à l'heure de Paris.
const TZ = 'Europe/Paris';

function offsetMinutes(utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

// "2026-12-03" + "14:30" (heure de Paris) -> Date
function parisToDate(dateStr, timeStr = '00:00') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  const t = /^(\d{2}):(\d{2})$/.exec(timeStr || '');
  if (!m || !t) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  let utc = naive - offsetMinutes(naive) * 60000;
  utc = naive - offsetMinutes(utc) * 60000; // corrige autour des changements d'heure
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d;
}

const toIso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const parisDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d)); // YYYY-MM-DD
const parisTime = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const parisLongDay = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
const parisShortDay = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
const slotLabel = (b) => `${parisLongDay(b.starts_at)}, ${parisTime(b.starts_at)} – ${parisTime(b.ends_at)}`;

// Lundi (YYYY-MM-DD) de la semaine contenant `dayStr`.
function mondayOf(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}
function addDays(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

const euros = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });
const durationLabel = (min) => (min % 60 ? `${Math.floor(min / 60)} h ${min % 60}` : `${min / 60} h`);

module.exports = { TZ, parisToDate, toIso, parisDay, parisTime, parisLongDay, parisShortDay, slotLabel, mondayOf, addDays, euros, durationLabel };
