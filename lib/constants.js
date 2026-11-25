// Listes de référence utilisées dans les formulaires et les filtres.

const SUBJECTS = [
  'Mathématiques', 'Français', 'Anglais', 'Espagnol', 'Allemand', 'Italien',
  'Physique-chimie', 'SVT', 'Histoire-géographie', 'SES', 'Philosophie',
  'Informatique / NSI', 'Économie', 'Droit', 'Musique', 'Aide aux devoirs',
];

// Les trois grands niveaux affichés sur les fiches des profs.
const LEVELS = {
  primaire: 'Primaire',
  college: 'Collège',
  lycee: 'Lycée',
};

// Classes possibles pour un élève (pour la fiche élève).
const SCHOOL_GRADES = [
  'CP', 'CE1', 'CE2', 'CM1', 'CM2',
  '6e', '5e', '4e', '3e',
  'Seconde', 'Première', 'Terminale',
  'Post-bac', 'Adulte',
];

const MODES = {
  domicile: "Au domicile de l'élève",
  chez_prof: 'Chez le prof / lieu public',
  en_ligne: 'En ligne (visio)',
};

const STUDY_YEARS = ['Bac+1', 'Bac+2', 'Bac+3', 'Bac+4', 'Bac+5', 'Bac+6 et plus'];

const MIN_TUTOR_AGE = 18;
const PARENTAL_CONSENT_AGE = 15; // âge de la majorité numérique en France (RGPD)

module.exports = {
  SUBJECTS, LEVELS, SCHOOL_GRADES, MODES, STUDY_YEARS, MIN_TUTOR_AGE, PARENTAL_CONSENT_AGE,
};

// ---------- Paiements ----------
const COMMISSION_RATE = 0.30;          // part gardée par Relais
const DURATIONS = [60, 90, 120];        // durées de cours proposées (minutes)
const CANCEL_LIMIT_HOURS = 24;          // annulation remboursée jusqu'à 24 h avant
const AUTO_VALIDATE_HOURS = 72;         // validation automatique si l'élève ne répond pas
const MIN_NOTICE_HOURS = 2;             // délai minimum avant un cours réservé

Object.assign(module.exports, { COMMISSION_RATE, DURATIONS, CANCEL_LIMIT_HOURS, AUTO_VALIDATE_HOURS, MIN_NOTICE_HOURS });
