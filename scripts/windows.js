// Raccourcis Windows pour lancer Relais sans taper de commande.
//   node scripts/windows.js raccourci            -> icône "Relais" sur le Bureau
//   node scripts/windows.js demarrage            -> lancement automatique (réduit) à l'ouverture de Windows
//   node scripts/windows.js retirer-demarrage    -> annule le lancement automatique
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LAUNCHER = path.join(ROOT, 'Lancer Relais.bat');
const ICON = path.join(ROOT, 'public', 'img', 'relais.ico');
const [cmd, ...flags] = process.argv.slice(2);
const silent = flags.includes('--silencieux');
const log = (msg) => { if (!silent) console.log(msg); };

if (process.platform !== 'win32') {
  log('Ces raccourcis sont prévus pour Windows. Sur Mac ou Linux, lance simplement : npm start');
  process.exit(0);
}

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' }).trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`; // chaîne PowerShell entre apostrophes

function createShortcut(file, { args = '', minimized = false } = {}) {
  ps([
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${q(file)})`,
    `$s.TargetPath = ${q(LAUNCHER)}`,
    `$s.Arguments = ${q(args)}`,
    `$s.WorkingDirectory = ${q(ROOT)}`,
    `$s.IconLocation = ${q(ICON + ',0')}`,
    `$s.Description = 'Relais - site en local'`,
    `$s.WindowStyle = ${minimized ? 7 : 1}`,
    '$s.Save()',
  ].join('; '));
}

const startupFile = () => path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Relais.lnk');

try {
  if (cmd === 'raccourci') {
    // Le vrai dossier Bureau (y compris quand il est synchronisé par OneDrive).
    const desktop = ps("[Environment]::GetFolderPath('Desktop')");
    const file = path.join(desktop, 'Relais.lnk');
    if (silent && fs.existsSync(file)) process.exit(0);
    createShortcut(file);
    console.log(`Icône « Relais » ajoutée sur le Bureau. La prochaine fois, double-clique simplement dessus.`);
  } else if (cmd === 'demarrage') {
    createShortcut(startupFile(), { args: '--fond', minimized: true });
    console.log("C'est fait : Relais démarrera tout seul (fenêtre réduite) à chaque ouverture de Windows.");
    console.log('Il suffira d\'ouvrir http://localhost:3000 dans ton navigateur (pense à l\'ajouter à tes favoris).');
  } else if (cmd === 'retirer-demarrage') {
    if (fs.existsSync(startupFile())) fs.unlinkSync(startupFile());
    console.log('Relais ne démarrera plus automatiquement avec Windows.');
  } else {
    console.log('Usage : node scripts/windows.js raccourci | demarrage | retirer-demarrage');
  }
} catch (err) {
  if (!silent) console.error('Impossible de créer le raccourci :', err.message);
}
