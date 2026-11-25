// Paiements et versements.
//
// Production : Stripe Connect (prestataire de paiement agréé).
//   - L'élève paie par carte sur la page sécurisée Stripe Checkout (3D Secure). Aucune donnée de carte ne passe par Relais.
//   - L'argent reste sur le compte Stripe de Relais jusqu'à la validation du cours.
//   - Le prof renseigne son RIB sur le formulaire sécurisé Stripe ; Relais ne stocke qu'un identifiant de compte ("acct_…").
//   - À la validation, Stripe vire 70 % au prof (transfer), Relais garde 30 %.
//
// Développement : si STRIPE_SECRET_KEY n'est pas défini, un mode SIMULATION remplace Stripe
// pour tester tout le parcours sans argent réel.
const { url } = require('./mailer');

const KEY = process.env.STRIPE_SECRET_KEY;
const MODE = KEY ? 'stripe' : 'simulation';
let stripe = null;
if (KEY) {
  const Stripe = require('stripe');
  stripe = (Stripe.default || Stripe)(KEY);
}

const stripeImpl = {
  async createAccount(user) {
    const acct = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      email: user.email,
      business_type: 'individual',
      capabilities: { transfers: { requested: true } },
      business_profile: { product_description: 'Cours particuliers donnés via Relais', mcc: '8299' },
      metadata: { relais_user_id: String(user.id) },
    });
    return acct.id;
  },
  async onboardingUrl(accountId) {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: url('/compte/versements/configurer'),
      return_url: url('/compte/versements/retour'),
    });
    return link.url;
  },
  async accountReady(accountId) {
    const acct = await stripe.accounts.retrieve(accountId);
    return !!(acct.payouts_enabled && acct.capabilities && acct.capabilities.transfers === 'active');
  },
  async dashboardUrl(accountId) {
    return (await stripe.accounts.createLoginLink(accountId)).url;
  },
  async createCheckout(booking, student, description) {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      customer_email: student.email,
      line_items: [{
        quantity: 1,
        price_data: { currency: 'eur', unit_amount: booking.price_cents, product_data: { name: description } },
      }],
      payment_intent_data: {
        transfer_group: `reservation_${booking.id}`,
        metadata: { booking_id: String(booking.id) },
      },
      metadata: { booking_id: String(booking.id) },
      success_url: url(`/reservations/${booking.id}/paiement/retour?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: url(`/reservations/${booking.id}?paiement=annule`),
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    return { id: session.id, url: session.url };
  },
  async checkoutResult(sessionId) {
    const s = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
    const pi = s.payment_intent;
    return {
      paid: s.payment_status === 'paid',
      bookingId: Number(s.metadata && s.metadata.booking_id),
      paymentIntentId: pi && pi.id,
      chargeId: pi && (typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge && pi.latest_charge.id),
    };
  },
  async transfer(booking, accountId) {
    const t = await stripe.transfers.create({
      amount: booking.tutor_amount_cents,
      currency: 'eur',
      destination: accountId,
      source_transaction: booking.charge_id, // les fonds viennent de ce paiement précis
      transfer_group: `reservation_${booking.id}`,
      metadata: { booking_id: String(booking.id) },
    }, { idempotencyKey: `transfer-reservation-${booking.id}` });
    return t.id;
  },
  async refund(booking) {
    const r = await stripe.refunds.create({ payment_intent: booking.payment_intent_id, metadata: { booking_id: String(booking.id) } },
      { idempotencyKey: `refund-reservation-${booking.id}` });
    return r.id;
  },
  webhookEvent(rawBody, signature) {
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  },
};

// Mode simulation : mêmes fonctions, sans appel à Stripe ni argent réel.
const fakeId = (p) => `${p}_simu_${Math.random().toString(36).slice(2, 12)}`;
const simulationImpl = {
  async createAccount() { return fakeId('acct'); },
  async onboardingUrl() { return '/simulation/versements'; },
  async accountReady(accountId) {
    const { db } = require('./db');
    const row = db.prepare('SELECT payouts_ready FROM tutor_profiles WHERE stripe_account_id = ?').get(accountId);
    return !!(row && row.payouts_ready);
  },
  async dashboardUrl() { return '/compte'; },
  async createCheckout(booking) { return { id: fakeId('cs'), url: `/simulation/paiement/${booking.id}` }; },
  async checkoutResult(sessionId) { return { paid: true, paymentIntentId: fakeId('pi'), chargeId: fakeId('ch'), sessionId }; },
  async transfer() { return fakeId('tr'); },
  async refund() { return fakeId('re'); },
  webhookEvent() { throw new Error('Pas de webhook en mode simulation'); },
};

module.exports = { MODE, ...(MODE === 'stripe' ? stripeImpl : simulationImpl), simulation: simulationImpl };
