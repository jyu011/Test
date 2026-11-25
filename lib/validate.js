const { SUBJECTS, LEVELS, MODES, SCHOOL_GRADES, STUDY_YEARS, MIN_TUTOR_AGE, PARENTAL_CONSENT_AGE } = require('./constants');
const { clean, asArray, join, ageFrom, EMAIL_RE, POSTAL_RE } = require('./helpers');

// Champs communs à tous les comptes. `withPassword` = inscription.
function validateIdentity(body, errors, { withPassword }) {
  const v = {
    email: clean(body.email, 160).toLowerCase(),
    first_name: clean(body.first_name, 60),
    last_name: clean(body.last_name, 60),
    birth_date: clean(body.birth_date, 10),
    phone: clean(body.phone, 20),
  };
  if (!EMAIL_RE.test(v.email)) errors.email = 'Adresse e-mail invalide.';
  if (!v.first_name) errors.first_name = 'Prénom obligatoire.';
  if (!v.last_name) errors.last_name = 'Nom obligatoire.';
  const age = ageFrom(v.birth_date);
  if (age === null || age < 5 || age > 110) errors.birth_date = 'Date de naissance invalide.';
  if (v.phone && !/^[+\d][\d .-]{8,18}$/.test(v.phone)) errors.phone = 'Numéro de téléphone invalide.';
  if (withPassword) {
    v.password = String(body.password || '');
    if (v.password.length < 8) errors.password = 'Au moins 8 caractères.';
    else if (v.password !== body.password_confirm) errors.password_confirm = 'Les deux mots de passe ne correspondent pas.';
    if (!body.cgu) errors.cgu = 'Tu dois accepter les CGU et la politique de confidentialité.';
  }
  v.age = age;
  return v;
}

function validateStudent(body, errors, identity) {
  const v = {
    account_type: body.account_type === 'parent' ? 'parent' : 'eleve',
    child_first_name: clean(body.child_first_name, 60),
    school_grade: SCHOOL_GRADES.includes(body.school_grade) ? body.school_grade : '',
    address: clean(body.address, 200),
    postal_code: clean(body.postal_code, 5),
    city: clean(body.city, 80),
    subjects: join(asArray(body.subjects).filter((s) => SUBJECTS.includes(s))),
    goals: clean(body.goals, 1000),
    parent_email: clean(body.parent_email, 160).toLowerCase(),
    parent_consent: body.parent_consent ? 1 : 0,
  };
  if (!v.school_grade) errors.school_grade = 'Choisis la classe.';
  if (!POSTAL_RE.test(v.postal_code)) errors.postal_code = 'Code postal à 5 chiffres.';
  if (!v.city) errors.city = 'Ville obligatoire.';
  if (v.account_type === 'parent') {
    if (!v.child_first_name) errors.child_first_name = "Prénom de l'enfant obligatoire.";
    if (identity.age !== null && identity.age < 18) errors.birth_date = 'Un compte parent doit être créé par un adulte.';
    v.parent_email = '';
    v.parent_consent = 0;
  } else if (identity.age !== null && identity.age < PARENTAL_CONSENT_AGE) {
    // Moins de 15 ans : l'accord d'un parent est obligatoire (RGPD, majorité numérique).
    if (!EMAIL_RE.test(v.parent_email)) errors.parent_email = "Moins de 15 ans : l'e-mail d'un parent est obligatoire.";
    if (!v.parent_consent) errors.parent_consent = "L'accord d'un parent est obligatoire.";
  }
  return v;
}

function validateTutor(body, errors, identity) {
  const v = {
    school: clean(body.school, 120),
    school_city: clean(body.school_city, 80),
    field_of_study: clean(body.field_of_study, 120),
    study_year: STUDY_YEARS.includes(body.study_year) ? body.study_year : '',
    address: clean(body.address, 200),
    postal_code: clean(body.postal_code, 5),
    city: clean(body.city, 80),
    radius_km: parseInt(body.radius_km, 10),
    modes: join(asArray(body.modes).filter((m) => MODES[m])),
    subjects: join(asArray(body.subjects).filter((s) => SUBJECTS.includes(s))),
    levels: join(asArray(body.levels).filter((l) => LEVELS[l])),
    hourly_rate: parseInt(body.hourly_rate, 10),
    headline: clean(body.headline, 100),
    description: clean(body.description, 3000),
  };
  if (identity && identity.age !== null && identity.age < MIN_TUTOR_AGE) {
    errors.birth_date = `Il faut avoir au moins ${MIN_TUTOR_AGE} ans pour donner des cours sur Relais.`;
  }
  if (!v.school) errors.school = 'Établissement obligatoire.';
  if (!v.field_of_study) errors.field_of_study = "Domaine d'études obligatoire.";
  if (!v.study_year) errors.study_year = "Choisis ton année d'études.";
  if (!v.address) errors.address = 'Adresse obligatoire (elle ne sera jamais affichée).';
  if (!POSTAL_RE.test(v.postal_code)) errors.postal_code = 'Code postal à 5 chiffres.';
  if (!v.city) errors.city = 'Ville obligatoire.';
  if (!(v.radius_km >= 0 && v.radius_km <= 100)) errors.radius_km = 'Entre 0 et 100 km.';
  if (!v.modes) errors.modes = 'Choisis au moins un format de cours.';
  if (!v.subjects) errors.subjects = 'Choisis au moins une matière.';
  if (!v.levels) errors.levels = 'Choisis au moins un niveau.';
  if (!(v.hourly_rate >= 5 && v.hourly_rate <= 150)) errors.hourly_rate = 'Tarif entre 5 et 150 € / h.';
  if (v.headline.length < 10) errors.headline = 'Une phrase d\'accroche d\'au moins 10 caractères.';
  if (v.description.length < 80) errors.description = 'Présente-toi en au moins 80 caractères.';
  return v;
}

module.exports = { validateIdentity, validateStudent, validateTutor };
