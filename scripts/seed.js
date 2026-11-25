// Remplit la base avec des profils de DÉMONSTRATION (fictifs) pour tester le site.
// Usage : npm run seed     (à ne PAS lancer sur le site en production)
const bcrypt = require('bcryptjs');
const { db } = require('../lib/db');

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0 && !process.argv.includes('--force')) {
  console.log('La base contient déjà des comptes. Relance avec --force pour ajouter quand même les données de démo.');
  process.exit(0);
}

const hash = bcrypt.hashSync('demo1234', 10);
const addUser = db.prepare(`INSERT INTO users (role, email, password_hash, first_name, last_name, birth_date, created_at, email_verified)
  VALUES (@role, @email, @hash, @first_name, @last_name, @birth_date, datetime('now', @ago), 1)`);
const addTutor = db.prepare(`INSERT INTO tutor_profiles (user_id, school, school_city, field_of_study, study_year, address, postal_code, city,
  radius_km, modes, subjects, levels, hourly_rate, headline, description, status)
  VALUES (@id, @school, @school_city, @field_of_study, @study_year, @address, @postal_code, @city, @radius_km, @modes, @subjects, @levels,
  @hourly_rate, @headline, @description, @status)`);
const addStudent = db.prepare(`INSERT INTO student_profiles (user_id, account_type, child_first_name, school_grade, address, postal_code, city, subjects, goals)
  VALUES (@id, @account_type, @child_first_name, @school_grade, @address, @postal_code, @city, @subjects, @goals)`);

const tutors = [
  { first_name: 'Léa', last_name: 'Martin', birth_date: '2005-03-12', school: 'Université Claude Bernard Lyon 1', school_city: 'Lyon', field_of_study: 'Licence de mathématiques', study_year: 'Bac+2', postal_code: '69003', city: 'Lyon', radius_km: 8, modes: 'domicile|en_ligne', subjects: 'Mathématiques|Physique-chimie', levels: 'college|lycee', hourly_rate: 20,
    headline: "J'aide les collégiens et lycéens à reprendre confiance en maths",
    description: "Étudiante en deuxième année de licence de maths à Lyon 1, j'ai eu mon bac avec spécialités maths et physique il y a deux ans, donc je connais très bien le programme actuel.\nJ'adore trouver la façon d'expliquer qui marche pour chaque élève : schémas, exemples concrets, beaucoup d'exercices. J'ai déjà fait deux ans de tutorat bénévole au lycée." },
  { first_name: 'Yanis', last_name: 'Benali', birth_date: '2004-07-02', school: 'INSA Lyon', school_city: 'Villeurbanne', field_of_study: "Cycle ingénieur – Informatique", study_year: 'Bac+3', postal_code: '69100', city: 'Villeurbanne', radius_km: 10, modes: 'domicile|chez_prof|en_ligne', subjects: 'Mathématiques|Informatique / NSI|Physique-chimie', levels: 'lycee', hourly_rate: 25,
    headline: 'Élève ingénieur, spécialiste maths et NSI pour le lycée',
    description: "En 3e année à l'INSA, je donne des cours de maths et de NSI depuis deux ans. J'aide surtout les élèves de Première et Terminale à préparer les épreuves de spécialité et le grand oral.\nMéthode : on part de tes contrôles, on repère ce qui bloque, et on construit une fiche méthode ensemble à chaque séance." },
  { first_name: 'Chloé', last_name: 'Durand', birth_date: '2005-11-20', school: 'Université Lumière Lyon 2', school_city: 'Lyon', field_of_study: 'Licence LLCER Anglais', study_year: 'Bac+2', postal_code: '69007', city: 'Lyon', radius_km: 5, modes: 'domicile|en_ligne', subjects: 'Anglais|Français|Aide aux devoirs', levels: 'primaire|college', hourly_rate: 17,
    headline: "Étudiante en anglais, patiente et pédagogue avec les plus jeunes",
    description: "J'ai vécu un an à Dublin et j'étudie aujourd'hui l'anglais à Lyon 2. J'aime beaucoup travailler avec les enfants du primaire et les collégiens : on apprend par le jeu, les chansons et des petits dialogues.\nJe propose aussi de l'aide aux devoirs pour les CM1-CM2." },
  { first_name: 'Hugo', last_name: 'Petit', birth_date: '2003-01-15', school: 'Sciences Po Lyon', school_city: 'Lyon', field_of_study: 'Sciences politiques', study_year: 'Bac+4', postal_code: '69002', city: 'Lyon', radius_km: 6, modes: 'domicile|chez_prof', subjects: 'Histoire-géographie|SES|Philosophie|Français', levels: 'college|lycee', hourly_rate: 22,
    headline: "Méthodo de la dissertation et du commentaire, du brevet au bac",
    description: "En 4e année à Sciences Po Lyon, j'accompagne des élèves en histoire-géo, SES et philosophie. Mon point fort : la méthode (problématique, plan, argumentation), qui fait souvent gagner plusieurs points rapidement.\nJe prépare aussi au brevet et au bac de français." },
  { first_name: 'Inès', last_name: 'Moreau', birth_date: '2005-05-30', school: 'Université Grenoble Alpes', school_city: 'Grenoble', field_of_study: 'PASS – Santé', study_year: 'Bac+1', postal_code: '38000', city: 'Grenoble', radius_km: 4, modes: 'domicile|en_ligne', subjects: 'SVT|Physique-chimie|Mathématiques', levels: 'college|lycee', hourly_rate: 18,
    headline: 'Étudiante en santé, SVT et physique-chimie au collège et au lycée',
    description: "Je viens d'avoir mon bac (mention très bien, spécialités SVT et physique-chimie) et je suis en première année de santé. Le programme du lycée est donc encore tout frais !\nJe peux aider pour les contrôles, le brevet, et l'organisation du travail." },
  { first_name: 'Thomas', last_name: 'Lefèvre', birth_date: '2002-09-09', school: 'Conservatoire à rayonnement régional de Lyon', school_city: 'Lyon', field_of_study: 'Musique – Piano', study_year: 'Bac+5', postal_code: '69005', city: 'Lyon', radius_km: 12, modes: 'domicile', subjects: 'Musique|Allemand', levels: 'primaire|college|lycee', hourly_rate: 28,
    headline: 'Pianiste en master, cours de piano et solfège tous niveaux',
    description: "Étudiant en master au conservatoire, j'enseigne le piano et la formation musicale depuis quatre ans à des élèves de 6 à 18 ans. Je suis aussi bilingue allemand et peux aider pour les cours au collège et au lycée." },
  { first_name: 'Sarah', last_name: 'Nguyen', birth_date: '2004-12-03', school: 'Université Paris Cité', school_city: 'Paris', field_of_study: 'Licence de lettres modernes', study_year: 'Bac+3', postal_code: '75013', city: 'Paris', radius_km: 5, modes: 'domicile|chez_prof|en_ligne', subjects: 'Français|Espagnol|Aide aux devoirs', levels: 'primaire|college|lycee', hourly_rate: 21,
    headline: "Lettres modernes : lecture, orthographe, et bac de français",
    description: "Étudiante en lettres à Paris, j'aide des élèves du CP à la Première : apprentissage de la lecture, orthographe, rédaction, et préparation au bac de français (écrit et oral). Je parle aussi couramment espagnol." },
  { first_name: 'Maxime', last_name: 'Roux', birth_date: '2004-04-18', school: 'Université Paris-Saclay', school_city: 'Orsay', field_of_study: 'Licence de physique', study_year: 'Bac+2', postal_code: '75014', city: 'Paris', radius_km: 7, modes: 'en_ligne|chez_prof', subjects: 'Physique-chimie|Mathématiques', levels: 'lycee', hourly_rate: 19,
    headline: 'Physique-chimie et maths au lycée, en visio ou en bibliothèque',
    description: "Étudiant en physique à Paris-Saclay, je donne des cours au lycée en ligne ou à la bibliothèque. J'utilise une tablette graphique en visio pour expliquer comme au tableau, et je t'envoie le résumé de chaque séance." },
  // Prof en attente de vérification : n'apparaît pas dans la liste publique.
  { first_name: 'Emma', last_name: 'Garcia', birth_date: '2005-08-25', school: 'Université Lyon 3', school_city: 'Lyon', field_of_study: 'Licence de droit', study_year: 'Bac+1', postal_code: '69008', city: 'Lyon', radius_km: 5, modes: 'domicile', subjects: 'Français|Aide aux devoirs', levels: 'primaire', hourly_rate: 15,
    headline: "Aide aux devoirs et français pour les élèves du primaire", status: 'en_attente',
    description: "Étudiante en droit, j'ai l'habitude de garder et d'aider mes petits cousins pour leurs devoirs. Je propose de l'aide aux devoirs et du soutien en français pour les élèves du CP au CM2." },
];

const students = [
  { first_name: 'Nadia', last_name: 'Fontaine', birth_date: '1982-06-14', account_type: 'parent', child_first_name: 'Lucas', school_grade: '4e', postal_code: '69003', city: 'Lyon', subjects: 'Mathématiques|Anglais', goals: 'Lucas a décroché en maths depuis la rentrée, on aimerait préparer le brevet sereinement.' },
  { first_name: 'Jules', last_name: 'Bernard', birth_date: '2008-02-10', account_type: 'eleve', school_grade: 'Terminale', postal_code: '69100', city: 'Villeurbanne', subjects: 'Mathématiques|Informatique / NSI', goals: 'Viser 16+ en spé maths pour Parcoursup.' },
  { first_name: 'Camille', last_name: 'Robert', birth_date: '2009-09-01', account_type: 'eleve', school_grade: 'Seconde', postal_code: '69002', city: 'Lyon', subjects: 'Histoire-géographie|Français', goals: 'Progresser en méthode de rédaction.' },
];

const reviews = [
  [0, 0, 5, "Léa est super patiente, Lucas a pris 4 points en maths en deux mois. Elle explique avec des schémas, ça l'aide beaucoup."],
  [0, 1, 4, 'Très claire et bien préparée. Les fiches méthode sont top pour réviser.'],
  [1, 1, 5, "Yanis m'a fait progresser énormément en NSI, il explique le code ligne par ligne. Je recommande à 100 %."],
  [3, 2, 5, "Grâce à Hugo j'ai enfin compris comment construire une problématique. Cours très structurés."],
  [3, 0, 4, 'Bon contact avec Lucas, ponctuel et sérieux.'],
  [2, 0, 5, 'Chloé a redonné le goût de l\'anglais à Lucas, avec des activités ludiques.'],
];

db.transaction(() => {
  addUser.run({ role: 'admin', email: 'admin@relais.local', hash, first_name: 'Admin', last_name: 'Relais', birth_date: '1990-01-01', ago: '-60 days' });
  const tutorIds = tutors.map((t, i) => {
    const { lastInsertRowid: id } = addUser.run({ role: 'prof', email: `prof${i + 1}@relais.local`, hash, ...t, ago: `-${40 - i * 4} days` });
    addTutor.run({ id, address: '[adresse privée de démo]', status: 'verifie', ...t });
    // Versements "configurés" en mode simulation pour les profs vérifiés de démo.
    if ((t.status || 'verifie') === 'verifie') {
      db.prepare('UPDATE tutor_profiles SET stripe_account_id = ?, payouts_ready = 1 WHERE user_id = ?').run(`acct_simu_demo${id}`, id);
    }
    return id;
  });
  const studentIds = students.map((s, i) => {
    const { lastInsertRowid: id } = addUser.run({ role: 'eleve', email: `eleve${i + 1}@relais.local`, hash, ...s, ago: `-${30 - i * 5} days` });
    addStudent.run({ id, address: '', child_first_name: null, ...s });
    return id;
  });
  for (const [ti, si, rating, comment] of reviews) {
    const conv = db.prepare('INSERT OR IGNORE INTO conversations (student_id, tutor_id) VALUES (?, ?)').run(studentIds[si], tutorIds[ti]);
    const convId = conv.changes ? conv.lastInsertRowid : db.prepare('SELECT id FROM conversations WHERE student_id = ? AND tutor_id = ?').get(studentIds[si], tutorIds[ti]).id;
    const msg = db.prepare("INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, datetime('now', ?), datetime('now'))");
    msg.run(convId, studentIds[si], `Bonjour ${tutors[ti].first_name}, seriez-vous disponible pour des cours ?`, '-20 days');
    msg.run(convId, tutorIds[ti], 'Bonjour ! Oui, avec plaisir. Je peux le mercredi après-midi ou le samedi matin.', '-19 days');
    db.prepare("INSERT INTO reviews (tutor_id, student_id, rating, comment, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))")
      .run(tutorIds[ti], studentIds[si], rating, comment, `-${10 - si} days`);
  }
  // Une conversation récente non lue pour Léa.
  const c = db.prepare('SELECT id FROM conversations WHERE student_id = ? AND tutor_id = ?').get(studentIds[0], tutorIds[0]);
  db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(c.id, studentIds[0], 'Bonjour Léa, est-ce possible de rajouter une séance avant le brevet blanc ?');

  // Quelques cours de démo pour remplir les plannings (heures de Paris).
  const { parisToDate, toIso, parisDay, addDays, mondayOf } = require('../lib/time');
  const { computePrice } = require('../lib/bookings');
  const monday = mondayOf(parisDay(Date.now()));
  const convOf = (si, ti) => {
    db.prepare('INSERT OR IGNORE INTO conversations (student_id, tutor_id) VALUES (?, ?)').run(studentIds[si], tutorIds[ti]);
    return db.prepare('SELECT id FROM conversations WHERE student_id = ? AND tutor_id = ?').get(studentIds[si], tutorIds[ti]).id;
  };
  const addBooking = (si, ti, dayOffset, time, dur, subject, mode, status) => {
    const start = parisToDate(addDays(monday, dayOffset), time);
    const rate = tutors[ti].hourly_rate;
    const p = computePrice(rate, dur);
    const done = status === 'terminee';
    db.prepare(`INSERT INTO bookings (conversation_id, student_id, tutor_id, starts_at, ends_at, duration_min, subject, mode, hourly_rate,
      price_cents, commission_cents, tutor_amount_cents, status, proposed_by, payment_intent_id, charge_id, paid_at, validated_at, validated_by,
      payout_status, transfer_id, paid_out_at, validation_asked, reminder_sent)
      VALUES (@conv, @s, @t, @start, @end, @dur, @subject, @mode, @rate, @price_cents, @commission_cents, @tutor_amount_cents, @status, @s,
      @pi, @ch, @paid, @val, @valBy, @payout, @tr, @paidOut, @asked, @asked)`).run({
      conv: convOf(si, ti), s: studentIds[si], t: tutorIds[ti], start: toIso(start), end: toIso(new Date(start.getTime() + dur * 60000)),
      dur, subject, mode, rate, ...p, status,
      pi: ['payee', 'terminee'].includes(status) ? 'pi_simu_demo' : null, ch: ['payee', 'terminee'].includes(status) ? 'ch_simu_demo' : null,
      paid: ['payee', 'terminee'].includes(status) ? toIso(new Date()) : null, val: done ? toIso(new Date()) : null, valBy: done ? 'eleve' : null,
      payout: done ? 'verse' : null, tr: done ? 'tr_simu_demo' : null, paidOut: done ? toIso(new Date()) : null, asked: done ? 1 : 0,
    });
  };
  addBooking(0, 0, -5, '17:00', 60, 'Mathématiques', 'domicile', 'terminee');
  addBooking(0, 0, 9, '17:00', 60, 'Mathématiques', 'domicile', 'payee');
  addBooking(1, 0, 10, '18:00', 90, 'Physique-chimie', 'en_ligne', 'payee');
  addBooking(0, 0, 12, '10:00', 60, 'Mathématiques', 'domicile', 'confirmee');
  addBooking(1, 1, 11, '14:00', 120, 'Informatique / NSI', 'chez_prof', 'payee');
})();

console.log(`Données de démo créées. Mot de passe de tous les comptes : demo1234
  Admin : admin@relais.local
  Profs : prof1@relais.local … prof${tutors.length}@relais.local (prof${tutors.length} = en attente de vérification)
  Élèves : eleve1@relais.local (parent), eleve2@relais.local, eleve3@relais.local`);
