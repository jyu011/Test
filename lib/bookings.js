// Logique des réservations : proposition, confirmation des deux côtés, paiement, validation, versement.
const { db } = require('./db');
const payments = require('./payments');
const emails = require('./emails');
const { toIso, slotLabel, euros, durationLabel } = require('./time');
const { COMMISSION_RATE, CANCEL_LIMIT_HOURS, AUTO_VALIDATE_HOURS } = require('./constants');

const HOUR = 3600 * 1000;
const user = (id) => db.prepare('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?').get(id);
const get = (id) => db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
const nowIso = () => toIso(new Date());

const STATUS_LABELS = {
  proposee: 'En attente de confirmation',
  confirmee: 'Confirmé, à payer',
  payee: 'Réservé et payé',
  terminee: 'Terminé',
  litige: 'Problème signalé',
  refusee: 'Refusé',
  annulee: 'Annulé',
  remboursee: 'Annulé et remboursé',
  expiree: 'Expiré',
};
const ACTIVE = ['proposee', 'confirmee', 'payee'];

function computePrice(hourlyRate, durationMin) {
  const price = Math.round(hourlyRate * 100 * durationMin / 60);
  const commission = Math.round(price * COMMISSION_RATE);
  return { price_cents: price, commission_cents: commission, tutor_amount_cents: price - commission };
}

// Message automatique dans la conversation, avec un lien vers la réservation.
function systemMessage(b, senderId, text) {
  db.prepare("INSERT INTO messages (conversation_id, sender_id, body, kind, booking_id) VALUES (?, ?, ?, 'reservation', ?)")
    .run(b.conversation_id, senderId, text, b.id);
}

function update(id, fields) {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE bookings SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`).run({ ...fields, id });
  return get(id);
}

// Vrai si l'un des deux a déjà un cours confirmé/payé qui chevauche ce créneau.
function hasConflict({ tutor_id, student_id, starts_at, ends_at, excludeId = 0 }) {
  return !!db.prepare(`SELECT 1 FROM bookings WHERE id != @excludeId AND status IN ('confirmee', 'payee')
    AND (tutor_id = @tutor_id OR student_id = @student_id) AND starts_at < @ends_at AND ends_at > @starts_at`)
    .get({ tutor_id, student_id, starts_at, ends_at, excludeId });
}

function propose({ conv, by, start, durationMin, subject, mode, note, hourlyRate }) {
  const end = new Date(start.getTime() + durationMin * 60000);
  const data = {
    conversation_id: conv.id, student_id: conv.student_id, tutor_id: conv.tutor_id,
    starts_at: toIso(start), ends_at: toIso(end), duration_min: durationMin, subject, mode, note: note || null,
    hourly_rate: hourlyRate, ...computePrice(hourlyRate, durationMin), proposed_by: by.id,
  };
  if (hasConflict(data)) throw new Error('Ce créneau chevauche un cours déjà confirmé.');
  const { lastInsertRowid } = db.prepare(`INSERT INTO bookings (conversation_id, student_id, tutor_id, starts_at, ends_at, duration_min, subject, mode, note,
    hourly_rate, price_cents, commission_cents, tutor_amount_cents, proposed_by)
    VALUES (@conversation_id, @student_id, @tutor_id, @starts_at, @ends_at, @duration_min, @subject, @mode, @note,
    @hourly_rate, @price_cents, @commission_cents, @tutor_amount_cents, @proposed_by)`).run(data);
  const b = get(lastInsertRowid);
  systemMessage(b, by.id, `Proposition de cours : ${subject}, ${slotLabel(b)} (${durationLabel(durationMin)}) – ${euros(b.price_cents)}.`);
  const other = user(by.id === b.student_id ? b.tutor_id : b.student_id);
  emails.bookingProposed(b, other, by);
  return b;
}

function accept(b, by) {
  if (hasConflict({ ...b, excludeId: b.id })) throw new Error('Ce créneau chevauche un cours déjà confirmé.');
  const nb = update(b.id, { status: 'confirmee' });
  systemMessage(nb, by.id, `Créneau confirmé par les deux parties. L'élève peut maintenant payer le cours (${euros(nb.price_cents)}).`);
  emails.bookingConfirmed(nb, user(nb.student_id), user(nb.tutor_id));
  return nb;
}

function refuse(b, by) {
  const nb = update(b.id, { status: 'refusee', cancelled_by: by.id });
  systemMessage(nb, by.id, `Créneau refusé : ${slotLabel(nb)}.`);
  emails.bookingRefused(nb, user(nb.proposed_by), by);
  return nb;
}

// Après paiement : remboursement intégral si annulé au moins 24 h avant le cours.
function canCancelPaid(b) {
  return new Date(b.starts_at).getTime() - Date.now() >= CANCEL_LIMIT_HOURS * HOUR;
}

async function cancel(b, by, reason) {
  let refundId = null;
  if (b.status === 'payee') {
    if (!canCancelPaid(b)) throw new Error(`Moins de ${CANCEL_LIMIT_HOURS} h avant le cours : contacte l'équipe Relais via « Signaler un problème ».`);
    refundId = await payments.refund(b);
  } else if (!['proposee', 'confirmee'].includes(b.status)) {
    throw new Error('Ce cours ne peut plus être annulé.');
  }
  const nb = update(b.id, { status: refundId ? 'remboursee' : 'annulee', cancelled_by: by.id, cancel_reason: reason || null, refund_id: refundId });
  systemMessage(nb, by.id, `Cours annulé : ${slotLabel(nb)}.${refundId ? ` L'élève est intégralement remboursé (${euros(nb.price_cents)}).` : ''}`);
  const other = user(by.id === nb.student_id ? nb.tutor_id : nb.student_id);
  emails.bookingCancelled(nb, other, by, !!refundId);
  if (refundId) emails.bookingCancelled(nb, by, null, true);
  return nb;
}

// Appelé quand Stripe confirme le paiement (retour de Checkout ou webhook). Idempotent.
function markPaid(bookingId, { paymentIntentId, chargeId }) {
  const b = get(bookingId);
  if (!b || b.status !== 'confirmee') return b;
  const nb = update(b.id, { status: 'payee', payment_intent_id: paymentIntentId, charge_id: chargeId, paid_at: nowIso() });
  systemMessage(nb, nb.student_id, `Paiement de ${euros(nb.price_cents)} reçu : le cours du ${slotLabel(nb)} est réservé.`);
  emails.bookingPaid(nb, user(nb.student_id), user(nb.tutor_id));
  return nb;
}

// Verse 70 % au prof. Si son RIB n'est pas encore configuré, le versement reste en attente.
async function payout(b) {
  const tp = db.prepare('SELECT stripe_account_id, payouts_ready FROM tutor_profiles WHERE user_id = ?').get(b.tutor_id);
  const tutor = user(b.tutor_id);
  if (!tp || !tp.stripe_account_id || !tp.payouts_ready) {
    if (b.payout_status !== 'en_attente') emails.payoutBlocked(b, tutor);
    return update(b.id, { payout_status: 'en_attente' });
  }
  try {
    const transferId = await payments.transfer(b, tp.stripe_account_id);
    const nb = update(b.id, { payout_status: 'verse', transfer_id: transferId, paid_out_at: nowIso() });
    emails.payoutSent(nb, tutor, user(b.student_id));
    return nb;
  } catch (err) {
    console.error(`[versement] réservation ${b.id} :`, err.message);
    return update(b.id, { payout_status: 'erreur' });
  }
}

async function validate(b, by) {
  if (b.status !== 'payee' && b.status !== 'litige') throw new Error('Ce cours ne peut pas être validé.');
  if (by !== 'admin' && Date.now() < new Date(b.starts_at).getTime()) throw new Error("Le cours n'a pas encore commencé.");
  const nb = update(b.id, { status: 'terminee', validated_at: nowIso(), validated_by: by });
  systemMessage(nb, nb.student_id, by === 'auto'
    ? `Cours du ${slotLabel(nb)} validé automatiquement (pas de problème signalé sous ${AUTO_VALIDATE_HOURS} h).`
    : `Cours du ${slotLabel(nb)} validé${by === 'admin' ? " par l'équipe Relais" : " par l'élève"}. Le prof va recevoir son paiement.`);
  return payout(nb);
}

function reportIssue(b, by, text) {
  if (b.status !== 'payee') throw new Error('Impossible de signaler un problème sur ce cours.');
  const nb = update(b.id, { status: 'litige', issue_text: text });
  systemMessage(nb, by.id, "L'élève a signalé un problème. Le paiement est bloqué le temps que l'équipe Relais examine la situation.");
  const admins = db.prepare("SELECT email FROM users WHERE role = 'admin'").all().map((a) => a.email);
  emails.issueReported(nb, user(nb.tutor_id), admins);
  return nb;
}

async function adminRefund(b) {
  if (!['litige', 'payee'].includes(b.status)) throw new Error('Remboursement impossible.');
  const refundId = await payments.refund(b);
  const nb = update(b.id, { status: 'remboursee', refund_id: refundId, cancel_reason: "Remboursé par l'équipe Relais" });
  systemMessage(nb, nb.student_id, `L'équipe Relais a remboursé l'élève (${euros(nb.price_cents)}).`);
  emails.bookingCancelled(nb, user(nb.student_id), null, true);
  emails.bookingCancelled(nb, user(nb.tutor_id), null, true);
  return nb;
}

// Tâches automatiques, lancées toutes les 10 minutes.
async function runScheduledTasks() {
  const now = Date.now();
  const iso = (ms) => toIso(new Date(ms));
  // Propositions jamais acceptées, ou créneaux confirmés jamais payés : expirés une fois l'heure passée.
  for (const b of db.prepare("SELECT * FROM bookings WHERE status IN ('proposee', 'confirmee') AND starts_at <= ?").all(iso(now))) {
    update(b.id, { status: 'expiree' });
  }
  // Rappel la veille du cours.
  for (const b of db.prepare("SELECT * FROM bookings WHERE status = 'payee' AND reminder_sent = 0 AND starts_at <= ? AND starts_at > ?").all(iso(now + 24 * HOUR), iso(now))) {
    const s = user(b.student_id); const t = user(b.tutor_id);
    emails.bookingReminder(b, s, t); emails.bookingReminder(b, t, s);
    update(b.id, { reminder_sent: 1 });
  }
  // Fin du cours : on demande à l'élève de valider.
  for (const b of db.prepare("SELECT * FROM bookings WHERE status = 'payee' AND validation_asked = 0 AND ends_at <= ?").all(iso(now))) {
    emails.askValidation(b, user(b.student_id), user(b.tutor_id));
    systemMessage(b, b.tutor_id, `Le cours du ${slotLabel(b)} est terminé. L'élève peut le valider ou signaler un problème.`);
    update(b.id, { validation_asked: 1 });
  }
  // Sans réponse sous 72 h : validation automatique (le prof ne reste pas bloqué).
  for (const b of db.prepare("SELECT * FROM bookings WHERE status = 'payee' AND ends_at <= ?").all(iso(now - AUTO_VALIDATE_HOURS * HOUR))) {
    try { await validate(b, 'auto'); } catch (err) { console.error(`[validation auto] ${b.id}`, err.message); }
  }
  // Versements en attente dont le RIB vient d'être configuré.
  for (const b of db.prepare(`SELECT b.* FROM bookings b JOIN tutor_profiles t ON t.user_id = b.tutor_id
    WHERE b.status = 'terminee' AND b.payout_status IN ('en_attente', 'erreur') AND t.payouts_ready = 1`).all()) {
    await payout(b);
  }
}

module.exports = {
  STATUS_LABELS, ACTIVE, get, computePrice, propose, accept, refuse, cancel, canCancelPaid, markPaid,
  validate, reportIssue, adminRefund, payout, runScheduledTasks, hasConflict,
};
