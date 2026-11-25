# relais.

Plateforme de mise en relation entre des élèves (du primaire au lycée) et des **étudiants** qui donnent des cours particuliers.

## Fonctionnalités

- **Accueil** : présentation du projet, avantages des profs étudiants, recherche rapide.
- **Trouver un prof** : fiches des profs avec niveaux (primaire, collège, lycée), matières, prix, note et avis. Filtres par matière, niveau, ville ou code postal, format et prix max.
- **Fiche détaillée d'un prof** : études, périmètre d'action (ville et rayon, jamais l'adresse), formats, présentation, photos, avis, bouton de contact.
- **Messagerie intégrée** : seuls les deux participants voient la conversation, avec actualisation automatique. Le prof voit la **fiche élève** (classe, ville, matières, objectifs) à côté de la conversation.
- **Avis et étoiles** : seulement par un élève qui a échangé avec le prof (et à qui le prof a répondu), pour limiter les faux avis.
- **Mon compte** : choix entre un compte élève (ou parent) et un compte prof, modification du profil, mot de passe, suppression du compte.
- **Vérification des profs** : certificat de scolarité obligatoire, stocké en privé. Le profil n'est visible qu'après validation dans l'espace **Admin** (`/admin`), qui sert aussi à modérer les avis.

## Lancer le site sur ton ordinateur

Il faut [Node.js](https://nodejs.org) version 20 ou plus.

```bash
npm install
npm run seed     # crée des comptes de démonstration (mot de passe : demo1234)
npm start        # puis ouvre http://localhost:3000
```

Comptes de démo : `admin@relais.local`, `prof1@relais.local` … `prof9@relais.local`, `eleve1@relais.local` … `eleve3@relais.local`.

## Mise en ligne

Le site a besoin d'un serveur Node.js et d'un **disque persistant** pour la base de données et les fichiers envoyés. Par exemple Render (Web Service + Disk), Railway, Fly.io ou un VPS.

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `NODE_ENV=production` | active les cookies sécurisés (HTTPS) |
| `SESSION_SECRET` | longue chaîne aléatoire et secrète (obligatoire en production) |
| `DATA_DIR` | dossier du disque persistant (base `relais.db` + `uploads/`) |
| `PORT` | port d'écoute (souvent fourni par l'hébergeur) |

Pour créer le compte administrateur en production, ne lance **pas** `npm run seed`. Utilise :

```bash
npm run create-admin -- ton@email.fr UnMotDePasseTresSolide
```

## Organisation du code

```
server.js            point d'entrée (sécurité, sessions, routes)
lib/                 base de données, validation, outils
routes/              pages publiques, comptes, messagerie, admin
views/               pages HTML (EJS) et morceaux réutilisables (partials/)
public/              CSS, JavaScript du navigateur, logo
scripts/             données de démo, création d'un admin
```

## Avant le lancement public

- Compléter les pages Mentions légales, CGU et Confidentialité (`views/legal.ejs`, éléments entre crochets).
- Ajouter l'envoi d'e-mails (confirmation d'adresse, mot de passe oublié, notification de nouveau message).
- Décider du modèle de paiement (paiement direct entre élève et prof, ou via la plateforme).
