#!/usr/bin/env node
/**
 * Tests de non-régression de Mon Budget.
 *
 *   npm test
 *
 * L'application est un fichier HTML unique dont tout le code vit dans un seul
 * bloc <script> : impossible d'en importer les fonctions depuis Node. On charge
 * donc la vraie page dans un Chrome sans interface (puppeteer, déjà présent dans
 * les devDependencies) et on exerce les fonctions là où elles tournent pour de
 * bon. Les tests portent sur les fonctions de calcul, qui sont pures et dont les
 * régressions passées ont toutes fini sur le téléphone de l'utilisateur.
 *
 * Pour ajouter un test : une entrée dans le tableau CAS ci-dessous. Chaque cas
 * reçoit `check(nom, condition, detail)` et travaille sur un DATA jetable,
 * restauré automatiquement après coup.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const RACINE = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
                '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveur() {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const abs = path.join(RACINE, rel);
      if (!abs.startsWith(RACINE) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404); return res.end('404');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Les cas. Tout ce qui suit s'exécute DANS la page : pas de fermeture sur des
 * variables Node, uniquement sur les globales de l'application.
 * ──────────────────────────────────────────────────────────────────────────── */
function tousLesCas() {
  const res = [];
  const check = (nom, ok, detail) => res.push({ nom, ok: !!ok, detail: ok ? '' : String(detail ?? '') });

  const sauve = DATA;   // `let DATA` est lexical : pas de window.DATA
  const annee = () => ({ soldes: { compteIng: 0, livretInitial: 0, livrets_bal: {} },
                         vars: {}, revenus: [], charges: [], excludeCalcMethods: [] });
  const libelles = a => a.map(r => r.label).join(',');
  const lignes = ls => ls.map(l => ({ label: l, cat: 'fixed', v: Array(12).fill(0), paid: Array(12).fill(false) }));

  // ── Arbitrage de synchro : _decideSync ──────────────────────────────────
  {
    const base = { mustAcceptCloud: false, localSaveTime: 0, cloudPushTime: 0 };
    [['a-jour',    { cloudRev: 5, seenRev: 5, pending: false }, false, false],
     ['en-avance', { cloudRev: 5, seenRev: 5, pending: true  }, true,  false],
     ['en-retard', { cloudRev: 7, seenRev: 5, pending: false }, false, false],
     ['conflit',   { cloudRev: 7, seenRev: 5, pending: true  }, true,  true ]
    ].forEach(([motif, args, localIsNewer, conflict]) => {
      const d = _decideSync({ ...base, ...args });
      check(`synchro · « ${motif} »`,
        d.reason === motif && d.localIsNewer === localIsNewer && d.conflict === conflict, JSON.stringify(d));
    });

    // Sans compteur côté cloud : aucune horloge ne doit être consultée (13.49).
    const avance = _decideSync({ cloudRev: 0, seenRev: 0, pending: false, mustAcceptCloud: false,
                                 localSaveTime: 9e9, cloudPushTime: 1 });
    const retard = _decideSync({ cloudRev: 0, seenRev: 0, pending: false, mustAcceptCloud: false,
                                 localSaveTime: 1, cloudPushTime: 9e9 });
    check('synchro · sans compteur → motif « sans-compteur »', avance.reason === 'sans-compteur', avance.reason);
    check('synchro · sans compteur → horloge ignorée',
      JSON.stringify(avance) === JSON.stringify(retard), `${JSON.stringify(avance)} vs ${JSON.stringify(retard)}`);
    check('synchro · sans compteur → conflit + noCounter',
      avance.conflict === true && avance.noCounter === true, JSON.stringify(avance));
    check('synchro · sans compteur → le local est conservé', avance.localIsNewer === true, JSON.stringify(avance));
    check('synchro · plus aucun repli « heritage-dates »', avance.reason !== 'heritage-dates', avance.reason);
    check('synchro · force-sync prime sur le cas sans compteur',
      _decideSync({ ...base, cloudRev: 0, seenRev: 0, pending: true, mustAcceptCloud: true }).reason === 'force-sync');
  }

  // ── Fusion : suppression d'année (13.49) ────────────────────────────────
  {
    const r = _mergeBudgetData({ '2026': annee(), '2027': annee() },
                               { '2026': annee(), _deletedYears: ['2027'] });
    check('fusion · une année supprimée ailleurs ne revient pas', !r['2027'], 'ressuscitée');
    check('fusion · la liste noire est propagée', (r._deletedYears || []).includes('2027'));

    const r2 = _mergeBudgetData({ '2026': annee(), '2027': annee() }, { '2026': annee() });
    check('fusion · une année absente SANS suppression est sauvée', !!r2['2027'], 'perdue');

    const r3 = _mergeBudgetData({ '2026': annee() },
                                { '2026': annee(), '2027': annee(), _deletedYears: ['2027'] });
    check('fusion · une année recréée survit à une liste noire périmée', !!r3['2027'], 'effacée à tort');

    const r4 = _mergeBudgetData({ '2026': annee(), '2027': annee(), _deletedYears: ['2027'] },
                                { '2026': annee() });
    check('fusion · suppression locale pas encore poussée respectée', !r4['2027'], 'ressuscitée');

    const loc = { '2026': annee() };
    loc['2026'].vars.alim = [{ id: 'x1', amount: 50, month: 3 }];
    const r5 = _mergeBudgetData(loc, { '2026': annee(), _deletedYears: ['2027'] });
    check('fusion · une tx locale absente du cloud est réinjectée',
      (r5['2026'].vars.alim || []).length === 1, JSON.stringify(r5['2026'].vars.alim));
  }

  // ── Ordre des lignes reporté aux années suivantes (13.50) ───────────────
  {
    const propager = (an, sec) => {
      const t = [];
      getYears().filter(y => parseInt(y) > parseInt(an))
                .forEach(y => { if (_ordreAAligner(y, sec, true)) t.push(y); });
      return t;
    };

    DATA = { '2026': annee(), '2027': annee() };
    DATA['2026'].charges = lignes(['Loyer', 'Assurance', 'Internet', 'Syndic']);
    DATA['2027'].charges = lignes(['Loyer', 'Assurance', 'Internet', 'Syndic']);
    const a = DATA['2026'].charges; a.splice(2, 0, a.splice(3, 1)[0]);
    const touchees = propager('2026', 'charges');
    check('ordre · 2027 suit le déplacement fait en 2026',
      libelles(DATA['2027'].charges) === 'Loyer,Assurance,Syndic,Internet', libelles(DATA['2027'].charges));
    check('ordre · les années touchées sont annoncées', touchees.join() === '2027', touchees.join());

    DATA = { '2025': annee(), '2026': annee(), '2027': annee() };
    ['2025', '2026', '2027'].forEach(y => { DATA[y].charges = lignes(['A', 'B', 'C']); });
    const b = DATA['2026'].charges; b.splice(0, 0, b.splice(2, 1)[0]);
    propager('2026', 'charges');
    check('ordre · une année ANTÉRIEURE n’est jamais touchée',
      libelles(DATA['2025'].charges) === 'A,B,C', libelles(DATA['2025'].charges));

    DATA = { '2026': annee(), '2027': annee() };
    DATA['2026'].charges = [{ label: 'A', cat: 'fixed', v: [1, 2, 3], paid: [] },
                            { label: 'B', cat: 'fixed', v: [4, 5, 6], paid: [] }];
    DATA['2027'].charges = [{ label: 'A', cat: 'fixed', v: [7, 8, 9], paid: [] },
                            { label: 'B', cat: 'fixed', v: [10, 11, 12], paid: [] }];
    const c = DATA['2026'].charges; c.splice(0, 0, c.splice(1, 1)[0]);
    propager('2026', 'charges');
    const r27 = DATA['2027'].charges;
    check('ordre · les montants suivent leur ligne, intacts',
      r27[0].label === 'B' && r27[0].v.join() === '10,11,12' &&
      r27[1].label === 'A' && r27[1].v.join() === '7,8,9',
      JSON.stringify(r27.map(r => [r.label, r.v])));

    DATA = { '2026': annee(), '2027': annee() };
    DATA['2026'].charges = lignes(['A', 'B']);
    DATA['2027'].charges = lignes(['A', 'B']);
    check('ordre · sans déplacement, aucune année signalée', propager('2026', 'charges').length === 0);
  }

  // ── Soldes d'ouverture chaînés + plus/moins-value (13.23, 13.40) ────────
  {
    const LIV = 'liv_invest';
    DATA = { '2026': annee(), '2027': annee() };
    ['2026', '2027'].forEach(y => { DATA[y].soldes.livrets_bal[LIV] = 0; });
    const ligne = (label, cat, fromBank) => ({ label, cat, livretId: LIV, fromBank: fromBank || undefined,
      v: Array(12).fill(0), paid: Array(12).fill(false), inCalc: true });

    const versement = ligne('Ordre permanent', 'livret_in');
    versement.v[8] = 50; versement.paid[8] = true;          // septembre payé
    [9, 10, 11].forEach(i => { versement.v[i] = 50; });     // prévus, non payés
    const moins = ligne('Moins-value', 'livret_out', true);
    DATA['2026'].charges = [versement, moins];

    check('soldes · seuls les mois payés comptent', computeLivret('2026', LIV) === 50, computeLivret('2026', LIV));

    moins.v[9] = 0.88; moins.paid[9] = true;
    check('soldes · une moins-value diminue le placement',
      computeLivret('2026', LIV) === 49.12, computeLivret('2026', LIV));
    check('soldes · l’ouverture de 2027 chaîne sur la fin de 2026',
      _livretStart('2027', LIV) === 49.12, _livretStart('2027', LIV));

    // fromBank : la variation de valeur ne doit pas toucher le compte courant.
    const sansVariation = computeCompte('2026', 'acc_main');
    moins.v[9] = 5;
    check('soldes · une moins-value ne touche pas le compte courant',
      computeCompte('2026', 'acc_main') === sansVariation,
      `${computeCompte('2026', 'acc_main')} vs ${sansVariation}`);

    // Un retrait, lui, recrédite bien le compte courant.
    const retrait = ligne('Retrait → Compte', 'livret_out');
    retrait.v[9] = 10; retrait.paid[9] = true;
    DATA['2026'].charges.push(retrait);
    check('soldes · un retrait recrédite le compte courant',
      computeCompte('2026', 'acc_main') === sansVariation + 10,
      `${computeCompte('2026', 'acc_main')} vs ${sansVariation + 10}`);
  }

  // ── Performance d'un placement : _livretPerformance ─────────────────────
  {
    const LIV = 'liv_perf';
    DATA = { '2026': annee(), '2027': annee() };
    ['2026', '2027'].forEach(y => { DATA[y].soldes.livrets_bal[LIV] = 0; });
    const l = (label, cat, fromBank) => ({ label, cat, livretId: LIV, fromBank: fromBank || undefined,
      v: Array(12).fill(0), paid: Array(12).fill(false), inCalc: true });

    const vers = l('Ordre permanent', 'livret_in');
    vers.v[8] = 50; vers.paid[8] = true;
    const moins = l('Moins-value', 'livret_out', true);
    moins.v[9] = 0.88; moins.paid[9] = true;
    DATA['2026'].charges = [vers, moins];

    let p = _livretPerformance(LIV);
    check('performance · total investi = versements, hors variations', p.base === 50, p.base);
    check('performance · valeur = investi + variations', p.valeur === 49.12, p.valeur);
    check('performance · le gain est la variation seule', p.gain === -0.88, p.gain);
    check('performance · pourcentage calcule sur l’investi', p.pct === -1.76, p.pct);
    check('performance · concorde avec computeLivret',
      p.valeur === computeLivret('2026', LIV), `${p.valeur} vs ${computeLivret('2026', LIV)}`);

    // Un retrait reduit l'investi, pas le gain.
    const ret = l('Retrait', 'livret_out');
    ret.v[10] = 20; ret.paid[10] = true;
    DATA['2026'].charges.push(ret);
    p = _livretPerformance(LIV);
    check('performance · un retrait diminue l’investi', p.base === 30, p.base);
    check('performance · un retrait ne touche pas le gain', p.gain === -0.88, p.gain);

    // Une plus-value l'annee suivante s'ajoute au gain cumule.
    const plus = l('Plus-value', 'livret_in', true);
    plus.v[5] = 3.5; plus.paid[5] = true;
    DATA['2027'].charges = [plus];
    p = _livretPerformance(LIV);
    check('performance · les variations se cumulent entre annees',
      p.gain === 2.62, p.gain);

    // Une ligne exclue du calcul ne compte pas.
    plus.inCalc = false;
    check('performance · une ligne exclue est ignoree',
      _livretPerformance(LIV).gain === -0.88, _livretPerformance(LIV).gain);
    plus.inCalc = true;

    // Un mois non paye ne compte pas.
    plus.paid[5] = false;
    check('performance · un mois non paye est ignore',
      _livretPerformance(LIV).gain === -0.88, _livretPerformance(LIV).gain);
  }

  // ── Mise à jour de la valeur d'un placement en cours d'année ────────────
  {
    const LIV = 'liv_maj';
    const AN = String(new Date().getFullYear());
    DATA = { [AN]: annee() };
    DATA[AN].soldes.livrets_bal[LIV] = 0;
    const l = (label, cat, fromBank) => ({ label, cat, livretId: LIV, fromBank: fromBank || undefined,
      v: Array(12).fill(0), paid: Array(12).fill(false), inCalc: true });

    const vers = l('Ordre permanent', 'livret_in');
    vers.v[0] = 100; vers.paid[0] = true;
    const plus  = { ...l('📈 Plus-value – test', 'livret_in', true),  paid: Array(12).fill(true) };
    const moins = { ...l('📉 Moins-value – test', 'livret_out', true), paid: Array(12).fill(true) };
    DATA[AN].charges = [vers, plus, moins];

    const valo = _lignesValorisation(AN, LIV);
    check('placement · les deux lignes de valorisation sont reconnues',
      valo.plus === plus && valo.moins === moins,
      `plus=${!!valo.plus} moins=${!!valo.moins}`);

    // Valeur réelle plus basse → moins-value
    let e = _majValeurPlacement(LIV, 95, AN, 5);
    check('placement · une valeur plus basse crée une moins-value', e === -5, e);
    check('placement · elle est inscrite au bon mois', moins.v[5] === 5, moins.v[5]);
    check('placement · la valeur calculée rejoint la valeur réelle',
      computeLivret(AN, LIV) === 95, computeLivret(AN, LIV));

    // Hausse ensuite → plus-value, sur un autre mois
    e = _majValeurPlacement(LIV, 103, AN, 6);
    check('placement · une valeur plus haute crée une plus-value', e === 8, e);
    check('placement · la valeur suit de nouveau le réel',
      computeLivret(AN, LIV) === 103, computeLivret(AN, LIV));
    check('placement · la moins-value précédente est conservée', moins.v[5] === 5, moins.v[5]);

    // Deux recalages dans le MÊME mois : les écarts s'additionnent
    _majValeurPlacement(LIV, 100, AN, 6);
    check('placement · deux recalages le même mois s’additionnent',
      computeLivret(AN, LIV) === 100, computeLivret(AN, LIV));

    // Aucun écart → rien n'est écrit
    const avant = JSON.stringify([plus.v, moins.v]);
    check('placement · sans écart, rien n’est inscrit',
      _majValeurPlacement(LIV, 100, AN, 7) === 0 && JSON.stringify([plus.v, moins.v]) === avant);

    // Les recalages sont du rendement, jamais de l'argent investi
    const perf = _livretPerformance(LIV);
    check('placement · l’investi reste le seul versement', perf.base === 100, perf.base);
    check('placement · valeur et gain concordent',
      perf.gain === 0 && perf.valeur === 100, `gain ${perf.gain}, valeur ${perf.valeur}`);
  }

  // ── Les onglets d'année sont redessinés en arrivant dessus (13.51) ──────
  {
    DATA = { '2026': annee(), '2027': annee() };
    const vrai = window.renderYear;
    const appels = [];
    window.renderYear = y => appels.push(y);
    ['y2026', 'y2027'].forEach(id => {
      if (!document.getElementById('tab-' + id)) {
        const d = document.createElement('div');
        d.id = 'tab-' + id; d.className = 'tab-panel'; document.body.appendChild(d);
      }
    });
    const faux = document.createElement('div'); faux.className = 'tab'; document.body.appendChild(faux);

    switchTab('y2027', faux);
    check('affichage · arriver sur un onglet d’année le redessine',
      appels.join() === '2027', appels.join() || '(aucun appel)');

    appels.length = 0;
    const garde = DATA['2027']; delete DATA['2027'];
    switchTab('y2027', faux);
    check('affichage · année absente de DATA → aucun rendu tenté',
      appels.length === 0, appels.join());
    DATA['2027'] = garde;
    window.renderYear = vrai;
    faux.remove();
  }

  DATA = sauve;
  return res;
}

/* ──────────────────────────────────────────────────────────────────────── */
(async () => {
  const s = await serveur();
  const port = s.address().port;
  const navigateur = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let code = 0;
  try {
    const page = await navigateur.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/budget_familial.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window._decideSync === 'function', { timeout: 15000 });

    const version = await page.evaluate(() => `${APP_VERSION} / SW ${SW_VERSION}`);
    console.log(`\nMon Budget ${version}\n`);

    const resultats = await page.evaluate(tousLesCas);
    let ok = 0, ko = 0;
    resultats.forEach(r => {
      if (r.ok) { ok++; console.log(`  ✓ ${r.nom}`); }
      else { ko++; console.log(`  ✗ ${r.nom}${r.detail ? `  → ${r.detail}` : ''}`); }
    });

    const fatales = erreurs.filter(m => !/ServiceWorker|Failed to register|favicon/i.test(m));
    if (fatales.length) {
      ko += fatales.length;
      fatales.forEach(m => console.log(`  ✗ erreur JavaScript au chargement : ${m}`));
    }

    console.log(`\n${ok} réussi(s), ${ko} échoué(s)\n`);
    code = ko ? 1 : 0;
  } catch (e) {
    console.error('\nLes tests n’ont pas pu s’exécuter :', e.message, '\n');
    code = 1;
  } finally {
    await navigateur.close();
    s.close();
  }
  process.exit(code);
})();
