// Tous les e-mails envoyés par Relais, au même endroit.
const { queue, url } = require('./mailer');
const { esc } = require('./helpers');
const { slotLabel, euros, durationLabel } = require('./time');

const name = (u) => esc(u.first_name);
const slot = (b) => esc(slotLabel(b));
const course = (b) => `<b>${esc(b.subject)}</b>, ${slot(b)} (${durationLabel(b.duration_min)})`;
const bookingLink = (b) => url(`/reservations/${b.id}`);

module.exports = {
  verification(user, token) {
    queue(user.email, 'Confirme ton adresse e-mail', {
      title: `Bienvenue sur Relais, ${user.first_name} !`,
      lines: ['Pour activer ton compte, confirme ton adresse e-mail en cliquant sur le bouton ci-dessous.', 'Ce lien est valable 48 heures.'],
      button: { label: 'Confirmer mon adresse', href: url(`/verifier-email?jeton=${token}`) },
    });
  },
  passwordReset(user, token) {
    queue(user.email, 'Réinitialise ton mot de passe', {
      title: 'Mot de passe oublié',
      lines: [`Bonjour ${name(user)},`, 'Tu as demandé à réinitialiser ton mot de passe. Ce lien est valable 1 heure.', "Si ce n'est pas toi, ignore simplement cet e-mail : ton mot de passe actuel reste valable."],
      button: { label: 'Choisir un nouveau mot de passe', href: url(`/reinitialiser?jeton=${token}`) },
    });
  },
  newMessage(recipient, sender, convId, preview) {
    queue(recipient.email, `Nouveau message de ${sender.first_name}`, {
      title: `${sender.first_name} t'a écrit`,
      lines: [`Bonjour ${name(recipient)},`, `Tu as reçu un nouveau message sur Relais :`, `<i>« ${esc(preview.slice(0, 200))}${preview.length > 200 ? '…' : ''} »</i>`],
      button: { label: 'Répondre', href: url(`/messages/${convId}`) },
    });
  },
  tutorStatus(user, status, note) {
    const ok = status === 'verifie';
    queue(user.email, ok ? 'Ton profil prof est validé !' : 'Ton profil prof n\'a pas été validé', {
      title: ok ? 'Ton profil est en ligne' : 'Profil non validé',
      lines: ok
        ? [`Bonjour ${name(user)},`, 'Ton certificat de scolarité a été vérifié : ton profil est maintenant visible par les élèves.', "Pense à configurer tes versements (ton RIB) depuis « Mon compte » pour pouvoir accepter des cours."]
        : [`Bonjour ${name(user)},`, `Ton justificatif n'a pas pu être validé${note ? ` : ${esc(note)}` : '.'}`, 'Tu peux envoyer un nouveau certificat depuis « Mon compte › Modifier mon profil ».'],
      button: { label: 'Mon compte', href: url('/compte') },
    });
  },
  bookingProposed(b, to, from) {
    queue(to.email, `${from.first_name} propose un cours`, {
      title: 'Nouvelle proposition de cours',
      lines: [`Bonjour ${name(to)},`, `${name(from)} propose un cours : ${course(b)}.`, `Prix : <b>${euros(b.price_cents)}</b>.`, 'Accepte ou refuse le créneau depuis la page de réservation.'],
      button: { label: 'Voir la proposition', href: bookingLink(b) },
    });
  },
  bookingConfirmed(b, student, tutor) {
    queue(student.email, 'Créneau confirmé : il reste à payer le cours', {
      title: 'Ton créneau est confirmé',
      lines: [`Bonjour ${name(student)},`, `Le cours avec ${name(tutor)} est confirmé des deux côtés : ${course(b)}.`, `Pour le réserver définitivement, règle <b>${euros(b.price_cents)}</b> par carte bancaire sur Relais. L'argent n'est versé à ${name(tutor)} qu'après le cours, quand tu confirmes qu'il s'est bien passé.`],
      button: { label: 'Payer le cours', href: url(`/reservations/${b.id}/payer`) },
    });
    queue(tutor.email, 'Créneau confirmé, en attente du paiement', {
      title: 'Créneau confirmé',
      lines: [`Bonjour ${name(tutor)},`, `Le créneau avec ${name(student)} est confirmé : ${course(b)}.`, "Nous t'écrirons dès que l'élève aura payé : le cours sera alors définitivement réservé."],
      button: { label: 'Voir mon planning', href: url('/planning') },
    });
  },
  bookingPaid(b, student, tutor) {
    queue(student.email, 'Paiement reçu, ton cours est réservé', {
      title: 'Cours réservé',
      lines: [`Bonjour ${name(student)},`, `Nous avons bien reçu ton paiement de <b>${euros(b.price_cents)}</b> pour le cours avec ${name(tutor)} : ${course(b)}.`, `Annulation gratuite et remboursement intégral jusqu'à 24 h avant le cours.`],
      button: { label: 'Voir mon planning', href: url('/planning') },
    });
    queue(tutor.email, `Cours réservé et payé par ${student.first_name}`, {
      title: 'Nouveau cours réservé',
      lines: [`Bonjour ${name(tutor)},`, `${name(student)} a payé le cours : ${course(b)}.`, `Tu recevras <b>${euros(b.tutor_amount_cents)}</b> sur ton compte bancaire une fois le cours validé par l'élève.`],
      button: { label: 'Voir mon planning', href: url('/planning') },
    });
  },
  bookingReminder(b, user, other) {
    queue(user.email, 'Rappel : cours demain', {
      title: 'Ton cours approche',
      lines: [`Bonjour ${name(user)},`, `Petit rappel : cours avec ${name(other)} — ${course(b)}.`],
      button: { label: 'Voir la réservation', href: bookingLink(b) },
    });
  },
  askValidation(b, student, tutor) {
    queue(student.email, `Comment s'est passé ton cours avec ${tutor.first_name} ?`, {
      title: 'Confirme que le cours a eu lieu',
      lines: [`Bonjour ${name(student)},`, `Ton cours avec ${name(tutor)} (${course(b)}) est terminé.`, `Si tout s'est bien passé, valide-le pour que ${name(tutor)} soit payé. En cas de problème, signale-le : l'argent reste bloqué le temps que nous regardions.`, `Sans réponse de ta part, le cours sera validé automatiquement au bout de 72 heures.`],
      button: { label: 'Valider ou signaler un problème', href: bookingLink(b) },
    });
  },
  payoutSent(b, tutor, student) {
    queue(tutor.email, `Versement de ${euros(b.tutor_amount_cents)} en route`, {
      title: 'Cours validé, versement envoyé',
      lines: [`Bonjour ${name(tutor)},`, `Le cours avec ${name(student)} (${course(b)}) a été validé.`, `<b>${euros(b.tutor_amount_cents)}</b> (70 % de ${euros(b.price_cents)}) sont envoyés sur ton compte bancaire. Comptes généralement 2 à 7 jours ouvrés selon ta banque.`],
      button: { label: 'Mes versements', href: url('/compte') },
    });
  },
  payoutBlocked(b, tutor) {
    queue(tutor.email, 'Configure tes versements pour être payé', {
      title: 'Un paiement t\'attend',
      lines: [`Bonjour ${name(tutor)},`, `Un cours a été validé (${euros(b.tutor_amount_cents)} pour toi), mais tes informations de versement (RIB) ne sont pas encore configurées.`, 'Configure-les depuis « Mon compte » : le versement partira automatiquement.'],
      button: { label: 'Configurer mes versements', href: url('/compte') },
    });
  },
  bookingCancelled(b, to, by, refunded) {
    queue(to.email, 'Cours annulé', {
      title: 'Un cours a été annulé',
      lines: [`Bonjour ${name(to)},`, `${by ? `${name(by)} a annulé` : 'Annulation du'} cours : ${course(b)}.`, refunded ? `Le paiement de ${euros(b.price_cents)} est intégralement remboursé sur la carte de l'élève (sous 5 à 10 jours).` : ''].filter(Boolean),
      button: { label: 'Voir mon planning', href: url('/planning') },
    });
  },
  bookingRefused(b, to, by) {
    queue(to.email, 'Créneau refusé', {
      title: 'Proposition refusée',
      lines: [`Bonjour ${name(to)},`, `${name(by)} n'est pas disponible pour : ${course(b)}.`, 'Vous pouvez convenir d\'un autre créneau dans la messagerie.'],
      button: { label: 'Ouvrir la messagerie', href: url(`/messages/${b.conversation_id}`) },
    });
  },
  issueReported(b, tutor, adminEmails) {
    queue(tutor.email, 'Un élève a signalé un problème', {
      title: 'Problème signalé sur un cours',
      lines: [`Bonjour ${name(tutor)},`, `L'élève a signalé un problème pour le cours ${course(b)}. Le paiement est bloqué le temps que l'équipe Relais examine la situation. Nous reviendrons vers toi rapidement.`],
    });
    adminEmails.forEach((e) => queue(e, `[Litige] Réservation n°${b.id}`, {
      title: `Litige sur la réservation n°${b.id}`,
      lines: [`Motif : <i>${esc(b.issue_text || '')}</i>`],
      button: { label: "Ouvrir l'administration", href: url('/admin#litiges') },
    }));
  },
};
