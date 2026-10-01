#!/usr/bin/env node
/**
 * Prépare une publication de Mon Budget.
 *
 *   npm run release            → version suivante (13.51 → 13.52, SW v331 → v332)
 *   npm run release 14.00      → version explicite
 *   npm run check              → vérifie seulement la cohérence, ne modifie rien
 *
 * Le numéro de version vit à QUATRE endroits qui doivent toujours concorder :
 *
 *   budget_familial.html   const APP_VERSION = '13.51';
 *   budget_familial.html   const SW_VERSION  = 'v331';
 *   sw.js                  const CACHE = 'mon-budget-v331';
 *   version.json           {"v":"13.51"}
 *
 * Les oublier est déjà arrivé : version.json est resté à 13.41 alors que
 * l'application annonçait 13.47, et la bannière de mise à jour ne pouvait plus
 * fonctionner. Une seule commande supprime cette classe d'erreur.
 *
 * Le script refuse de publier si les tests échouent ou si l'entrée de changelog
 * de la nouvelle version manque : une version sans changelog est invisible pour
 * l'utilisateur.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const APP = path.join(RACINE, 'budget_familial.html');
const SW = path.join(RACINE, 'sw.js');
const VER = path.join(RACINE, 'version.json');

const RE_APP = /const APP_VERSION = '([\d.]+)';/;
const RE_SW = /const SW_VERSION = 'v(\d+)';/;
const RE_CACHE = /const CACHE = 'mon-budget-v(\d+)';/;

const lire = f => fs.readFileSync(f, 'utf8');
const rouge = t => `\x1b[31m${t}\x1b[0m`;
const vert = t => `\x1b[32m${t}\x1b[0m`;
const gris = t => `\x1b[90m${t}\x1b[0m`;

function etat() {
  const app = lire(APP), sw = lire(SW);
  const mApp = app.match(RE_APP), mSw = app.match(RE_SW), mCache = sw.match(RE_CACHE);
  if (!mApp) throw new Error('APP_VERSION introuvable dans budget_familial.html');
  if (!mSw) throw new Error('SW_VERSION introuvable dans budget_familial.html');
  if (!mCache) throw new Error('CACHE introuvable dans sw.js');
  let json = null;
  try { json = JSON.parse(lire(VER)).v; } catch { /* version.json illisible */ }
  return { appVersion: mApp[1], swVersion: parseInt(mSw[1]), cache: parseInt(mCache[1]), json };
}

function verifier(e) {
  const soucis = [];
  if (e.swVersion !== e.cache) soucis.push(`SW_VERSION (v${e.swVersion}) ≠ CACHE de sw.js (v${e.cache})`);
  if (e.json !== e.appVersion) soucis.push(`version.json (${e.json ?? 'illisible'}) ≠ APP_VERSION (${e.appVersion})`);
  return soucis;
}

function changelogContient(version) {
  return new RegExp(`^\\s*'${version.replace('.', '\\.')}':\\s*\\{`, 'm').test(lire(APP));
}

function versionSuivante(v) {
  const [maj, min] = v.split('.');
  return `${maj}.${String(parseInt(min) + 1).padStart(min.length, '0')}`;
}

function ecrire(nouvelleApp, nouveauSw) {
  fs.writeFileSync(APP, lire(APP)
    .replace(RE_APP, `const APP_VERSION = '${nouvelleApp}';`)
    .replace(RE_SW, `const SW_VERSION = 'v${nouveauSw}';`));
  fs.writeFileSync(SW, lire(SW).replace(RE_CACHE, `const CACHE = 'mon-budget-v${nouveauSw}';`));
  fs.writeFileSync(VER, JSON.stringify({ v: nouvelleApp }) + '\n');
}

/* ──────────────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const modeCheck = args.includes('--check');
const sansTests = args.includes('--no-test');
const demandee = args.find(a => /^\d+\.\d+$/.test(a));

try {
  const avant = etat();

  if (modeCheck) {
    const soucis = verifier(avant);
    console.log(`\nApp ${avant.appVersion} · SW v${avant.swVersion} · cache v${avant.cache} · version.json ${avant.json}`);
    if (soucis.length) {
      soucis.forEach(s => console.log(rouge('  ✗ ' + s)));
      console.log(rouge('\nIncohérence : lancez « npm run release » pour réaligner.\n'));
      process.exit(1);
    }
    console.log(vert('  ✓ les quatre marqueurs concordent\n'));
    process.exit(0);
  }

  const nouvelleApp = demandee || versionSuivante(avant.appVersion);
  const nouveauSw = Math.max(avant.swVersion, avant.cache) + 1;

  if (nouvelleApp === avant.appVersion) {
    console.log(rouge(`\nLa version ${nouvelleApp} est déjà celle en place.\n`));
    process.exit(1);
  }
  if (!changelogContient(nouvelleApp)) {
    console.log(rouge(`\nAucune entrée de changelog pour ${nouvelleApp}.`));
    console.log(`Ajoutez-la en tête de l'objet CHANGELOG de budget_familial.html :\n`);
    console.log(gris(`  '${nouvelleApp}': {\n    date: 'Mois Année',\n    items: [\n      { icon: '…', text: '…' }\n    ]\n  },\n`));
    process.exit(1);
  }

  if (!sansTests) {
    console.log(gris('\nTests…'));
    try {
      execFileSync(process.execPath, [path.join(RACINE, 'tests', 'run.js')], { stdio: 'inherit' });
    } catch {
      console.log(rouge('\nTests en échec — rien n’a été modifié.\n'));
      process.exit(1);
    }
  }

  ecrire(nouvelleApp, nouveauSw);
  const apres = etat();
  const soucis = verifier(apres);
  if (soucis.length) {
    soucis.forEach(s => console.log(rouge('  ✗ ' + s)));
    console.log(rouge('\nÉcriture incohérente — vérifiez les fichiers.\n'));
    process.exit(1);
  }

  console.log(vert(`\n✓ ${avant.appVersion} → ${apres.appVersion}  ·  SW v${avant.swVersion} → v${apres.swVersion}`));
  console.log(gris('  budget_familial.html (APP_VERSION, SW_VERSION) · sw.js (CACHE) · version.json'));
  console.log(gris('\n  git add budget_familial.html sw.js version.json && git commit && git push\n'));
} catch (e) {
  console.log(rouge(`\n${e.message}\n`));
  process.exit(1);
}
