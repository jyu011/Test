# relais.

Plateforme de mise en relation entre des élèves (du primaire au lycée) et des **étudiants** qui donnent des cours particuliers.

## Fonctionnalités

- **Accueil** : présentation du projet, avantages des profs étudiants, recherche rapide.
- **Trouver un prof** : fiches des profs avec niveaux (primaire, collège, lycée), matières, prix, note et avis. Filtres par matière, niveau, ville ou code postal, format et prix max.
- **Fiche détaillée d'un prof** : études, périmètre d'action (ville et rayon, jamais l'adresse), formats, présentation, photos, avis, bouton de contact.
- **Messagerie intégrée** : seuls les deux participants voient la conversation, avec actualisation automatique. Le prof voit la **fiche élève** (classe, ville, matières, objectifs) à côté de la conversation.
- **Avis et étoiles** : seulement par un élève qui a échangé avec le prof (et à qui le prof a répondu), pour limiter les faux avis.
- **Mon compte** : choix entre un compte élève (ou parent) et un compte prof, modification du profil, mot de passe, suppression du compte.
- **Réservation de cours** : depuis la messagerie (« Réserver un cours »), l'élève ou le prof propose un créneau, et l'autre l'accepte. Le cours est alors confirmé des deux côtés.
- **Paiement par carte** : l'élève paie le cours sur Relais (Stripe Checkout, 3D Secure). L'argent reste bloqué jusqu'à la fin du cours.
- **Validation et versement** : après le cours, l'élève confirme qu'il s'est bien passé (ou signale un problème). Le prof reçoit alors **70 %** du prix sur son compte bancaire, et Relais garde **30 %**. Sans réponse de l'élève, le cours est validé automatiquement au bout de 72 h.
- **Annulation** : remboursement intégral jusqu'à 24 h avant le cours. En cas de litige, l'admin choisit de rembourser l'élève ou de payer le prof.
- **RIB des profs** : saisi sur le formulaire sécurisé de Stripe et conservé par Stripe. Il n'est jamais stocké ni affiché par Relais.
- **Planning** : vue par semaine des cours de l'élève ou du prof (avec tous ses élèves), une liste « À faire » et les prochains cours.
- **E-mails automatiques** : confirmation d'adresse, mot de passe oublié, nouveau message, proposition, confirmation et paiement d'un cours, rappel la veille, demande de validation, versement, annulation, litige, validation du profil prof.
- **Vérification des profs** : certificat de scolarité obligatoire, stocké en privé. Le profil n'est visible qu'après validation dans l'espace **Admin** (`/admin`), qui sert aussi à modérer les avis.

## Lancer le site sur ton ordinateur

Il faut [Node.js](https://nodejs.org) version 20 ou plus.

```bash
npm install
npm run seed     # crée des comptes de démonstration (mot de passe : demo1234)
npm start        # puis ouvre http://localhost:3000
```

Comptes de démo : `admin@relais.local`, `prof1@relais.local` … `prof9@relais.local`, `eleve1@relais.local` … `eleve3@relais.local`.

Sans configuration, le site tourne en **mode simulation** :
- **Paiements** : des pages de test remplacent Stripe, et aucun argent réel ne circule.
- **E-mails** : ils sont enregistrés dans `data/emails/` et lisibles sur http://localhost:3000/dev/emails.

## Paiements avec Stripe Connect

1. Crée un compte sur [stripe.com](https://stripe.com), puis active **Connect** (type de compte : *Express*).
2. Récupère la clé secrète (`STRIPE_SECRET_KEY`). Utilise d'abord une clé de **test** (`sk_test_...`) avec la carte `4242 4242 4242 4242`.
3. Dans Stripe › Développeurs › Webhooks, ajoute l'URL `https://ton-domaine/webhooks/stripe` avec les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded` et `account.updated`, puis copie le secret dans `STRIPE_WEBHOOK_SECRET`.

Les frais Stripe (environ 1,5 % + 0,25 € par paiement par carte européenne) sont pris sur les 30 % de Relais.

## E-mails

N'importe quel service SMTP convient. Par exemple [Brevo](https://www.brevo.com), service français avec une offre gratuite de 300 e-mails par jour. Renseigne `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` et `MAIL_FROM`, et pense à authentifier ton nom de domaine (SPF/DKIM) chez le fournisseur pour ne pas finir en spam.

## Mise en ligne

Le site a besoin d'un serveur Node.js et d'un **disque persistant** pour la base de données et les fichiers envoyés. Par exemple Render (Web Service + Disk), Railway, Fly.io ou un VPS.

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `NODE_ENV=production` | active les cookies sécurisés (HTTPS) |
| `SESSION_SECRET` | longue chaîne aléatoire et secrète (obligatoire en production) |
| `DATA_DIR` | dossier du disque persistant (base `relais.db` + `uploads/`) |
| `PORT` | port d'écoute (souvent fourni par l'hébergeur) |
| `APP_URL` | adresse publique du site (liens des e-mails et retours de paiement) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | paiements (voir ci-dessus) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | envoi des e-mails |

Toutes les variables sont listées dans `.env.example`.

Pour créer le compte administrateur en production, ne lance **pas** `npm run seed`. Utilise :

```bash
npm run create-admin -- ton@email.fr UnMotDePasseTresSolide
```

## Organisation du code

```
server.js            point d'entrée (sécurité, sessions, routes)
lib/                 base de données, validation, paiements (payments.js), réservations (bookings.js), e-mails (mailer.js, emails.js)
routes/              pages publiques, comptes, messagerie, réservations, versements, admin
views/               pages HTML (EJS) et morceaux réutilisables (partials/)
public/              CSS, JavaScript du navigateur, logo
scripts/             données de démo, création d'un admin
```

## Avant le lancement public

- Compléter les pages Mentions légales, CGU et Confidentialité (`views/legal.ejs`, éléments entre crochets).
- Créer le compte Stripe, et vérifier avec Stripe que l'activité (cours particuliers par des étudiants) est acceptée en Connect.
- Fiscalité : les plateformes doivent déclarer les revenus des profs à l'administration (DAC7) et les informer de leurs obligations. Les profs doivent déclarer leurs revenus (souvent en micro-entreprise).
- Faire relire les CGU par un juriste (commission de 30 %, annulation, litiges).
