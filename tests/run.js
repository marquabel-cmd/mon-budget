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
 * Contrôles sur le SOURCE, pas sur la page.
 *
 * Une clé de traduction définie deux fois est invisible à l'exécution : dans un
 * objet JavaScript, la dernière l'emporte en silence et l'objet n'en garde
 * qu'une. Impossible, donc, de détecter le problème depuis le navigateur — il
 * faut relire le fichier. C'est exactement ce qui avait produit l'étiquette
 * « Projection {0} » sur le tableau de bord et le mauvais texte dans
 * l'assistant de démarrage : deux écrans différents partageaient une clé.
 * ──────────────────────────────────────────────────────────────────────────── */
function verificationsSource() {
  const res = [];
  const check = (nom, ok, detail) => res.push({ nom, ok: !!ok, detail: ok ? '' : String(detail ?? '') });
  const src = fs.readFileSync(path.join(RACINE, 'budget_familial.html'), 'utf8');
  const lignes = src.split('\n');

  const pos = new Map();
  lignes.forEach((l, i) => {
    const m = l.match(/^ {4}'([a-z0-9_.]+)'\s*:/);
    if (m) {
      if (!pos.has(m[1])) pos.set(m[1], []);
      pos.get(m[1]).push(i + 1);
    }
  });

  // Deux tables (fr, en) : une clé saine apparaît au plus deux fois.
  const doublons = [...pos.entries()].filter(([, v]) => v.length > 2);
  check('i18n · aucune clé définie deux fois dans une même langue',
    doublons.length === 0,
    doublons.map(([k, v]) => `${k} (lignes ${v.join(', ')})`).join(' · '));

  // Une clé qui ne sert qu'une fois trahit une faute de frappe dans l'autre langue.
  const orphelines = [...pos.entries()].filter(([, v]) => v.length === 1).map(([k]) => k);
  check('i18n · chaque clé existe dans les deux langues',
    orphelines.length === 0, orphelines.join(', '));

  // Une étiquette qui porte {0} doit être substituée partout où elle est lue,
  // sinon l'utilisateur voit le gabarit brut.
  const gabarits = [...pos.entries()]
    .filter(([k]) => new RegExp(`'${k.replace(/\./g, '\\.')}':\\s*'[^']*\\{0\\}`).test(src))
    .map(([k]) => k);
  // La substitution peut être immédiate — t('x').replace('{0}', …) — ou différée
  // d'une ligne ou deux en passant par une variable. On regarde donc dans la
  // fenêtre qui suit l'appel, au lieu d'exiger un enchaînement direct.
  // `t(cle, valeur)` substitue déjà {0} lui-même : seuls les appels SANS argument
  // posent question. La substitution peut alors être immédiate —
  // t('x').replace('{0}', …) — ou différée d'une ligne en passant par une
  // variable : on regarde donc dans la fenêtre qui suit l'appel.
  const FENETRE = 260;
  const nonSubstituees = gabarits.filter(k => {
    const re = new RegExp(`t\\('${k.replace(/\./g, '\\.')}'\\)`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      const suite = src.slice(m.index, m.index + FENETRE);
      if (!suite.includes(".replace('{0}'")) return true;
    }
    return false;
  });
  check('i18n · toute étiquette contenant {0} est bien substituée',
    nonSubstituees.length === 0,
    nonSubstituees.map(k => `${k} lu sans .replace('{0}', …)`).join(' · '));

  return res;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Les cas. Tout ce qui suit s'exécute DANS la page : pas de fermeture sur des
 * variables Node, uniquement sur les globales de l'application.
 * ──────────────────────────────────────────────────────────────────────────── */
async function tousLesCas() {
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

  // ── Évolution d'un placement : _livretSerie ─────────────────────────────
  {
    const LIV = 'liv_serie';
    const AN = new Date().getFullYear();
    const moisNow = new Date().getMonth();
    DATA = { [String(AN)]: annee() };
    DATA[String(AN)].soldes.livrets_bal[LIV] = 0;
    const l = (label, cat, fromBank) => ({ label, cat, livretId: LIV, fromBank: fromBank || undefined,
      v: Array(12).fill(0), paid: Array(12).fill(false), inCalc: true });

    // Premier mouvement en mars seulement
    const vers = l('Ordre permanent', 'livret_in');
    vers.v[2] = 100; vers.paid[2] = true;
    const plus = { ...l('📈 Plus-value', 'livret_in', true), paid: Array(12).fill(true) };
    plus.v[3] = 10;
    DATA[String(AN)].charges = [vers, plus];

    let s = _livretSerie(LIV);
    check('évolution · les mois plats avant le 1er mouvement sont rognés',
      s.length > 0 && s[0].mois === 1, s.length ? `commence en mois ${s[0].mois}` : 'série vide');
    check('évolution · un point est gardé juste avant le départ',
      s[0].investi === 0 && s[0].valeur === 0 && s[0].bouge === false, JSON.stringify(s[0]));
    check('évolution · seuls les mois qui bougent sont marqués',
      s.filter(p => p.bouge).map(p => p.mois).join() === '2,3',
      s.filter(p => p.bouge).map(p => p.mois).join());
    check('évolution · le dernier point porte la valeur courante',
      s[s.length - 1].valeur === 110 && s[s.length - 1].investi === 100,
      JSON.stringify(s[s.length - 1]));
    check('évolution · elle concorde avec _livretPerformance',
      s[s.length - 1].valeur === _livretPerformance(LIV).valeur,
      `${s[s.length - 1].valeur} vs ${_livretPerformance(LIV).valeur}`);
    check('évolution · elle s’arrête au mois en cours',
      s[s.length - 1].mois === moisNow && s[s.length - 1].annee === String(AN),
      `mois ${s[s.length - 1].mois} / ${moisNow}`);

    // Les montants prévus pour les mois à venir ne doivent rien changer
    if (moisNow < 11) {
      const avant = JSON.stringify(_livretSerie(LIV));
      vers.v[11] = 999; vers.paid[11] = true;
      check('évolution · un montant futur n’apparaît pas dans la courbe',
        JSON.stringify(_livretSerie(LIV)) === avant, 'la série a changé');
      vers.v[11] = 0; vers.paid[11] = false;
    }

    // Une série trop courte ne doit pas produire de SVG bancal
    check('évolution · pas de courbe sous deux points',
      _livretCourbeSvg([{ annee: String(AN), mois: 0, investi: 0, valeur: 0 }]) === '');
    check('évolution · la courbe est produite au-delà',
      _livretCourbeSvg(s).includes('<polyline'), 'aucune polyligne');
    check('évolution · le tableau ne liste que les mois qui bougent',
      (_livretTableauHtml(s).match(/<tr style="border-top/g) || []).length === 2,
      (_livretTableauHtml(s).match(/<tr style="border-top/g) || []).length);
  }

  // ── Bilan de santé des données ──────────────────────────────────────────
  {
    const l = (label, extra) => ({ label, cat: 'fixed', v: Array(12).fill(10),
      paid: Array(12).fill(false), noEnd: true, ...(extra || {}) });

    // Données saines : les deux années portent les mêmes lignes
    DATA = { '2026': annee(), '2027': annee() };
    ['2026', '2027'].forEach(y => {
      DATA[y].charges = [l('Loyer'), l('Internet')];
      DATA[y].revenus = [l('Salaire')];
    });
    check('bilan · aucune ligne manquante quand les années concordent',
      _lignesAbsentesDesSuivantes().length === 0,
      JSON.stringify(_lignesAbsentesDesSuivantes()));

    // Une ligne ajoutée en 2026 après la création de 2027
    DATA['2026'].charges.push(l('Assurance vélo'));
    let manques = _lignesAbsentesDesSuivantes();
    check('bilan · une ligne absente de l’année suivante est détectée',
      manques.length === 1 && manques[0].label === 'Assurance vélo' && manques[0].cible === '2027',
      JSON.stringify(manques));

    // Une ligne terminée avant 2027 : son absence est normale
    DATA['2026'].charges.push(l('Prêt voiture', { noEnd: false, endYear: 2026, endMonth: 11 }));
    check('bilan · une ligne échue n’est pas signalée comme manquante',
      _lignesAbsentesDesSuivantes().length === 1,
      JSON.stringify(_lignesAbsentesDesSuivantes().map(m => m.label)));

    // Les lignes d'ajustement et de valorisation sont hors sujet
    DATA['2026'].charges.push(l('🔧 Ajustement solde réel', { _adjust: true }));
    DATA['2026'].charges.push(l('📈 Plus-value', { fromBank: true }));
    check('bilan · ajustements et valorisations sont ignorés',
      _lignesAbsentesDesSuivantes().length === 1,
      JSON.stringify(_lignesAbsentesDesSuivantes().map(m => m.label)));

    // Le bilan lui-même
    const rapport = _bilanSante();
    check('bilan · tous les contrôles sont rendus',
      Array.isArray(rapport) && rapport.length === 6, rapport.length);
    check('bilan · chaque contrôle porte un verdict',
      rapport.every(c => typeof c.ok === 'boolean' && c.titre),
      JSON.stringify(rapport.map(c => [c.titre, c.ok])));
    check('bilan · le contrôle des lignes manquantes a vu le problème',
      rapport.find(c => c.titre.startsWith('Lignes présentes')).ok === false,
      'non détecté');

    // Une seule année : rien à comparer
    DATA = { '2026': annee() };
    DATA['2026'].charges = [l('Loyer')];
    check('bilan · une seule année ne produit aucun manque',
      _lignesAbsentesDesSuivantes().length === 0,
      JSON.stringify(_lignesAbsentesDesSuivantes()));
    check('bilan · il reste consultable avec une seule année',
      _bilanSante().length === 6, _bilanSante().length);
  }

  // ── Regroupement des lignes manquantes dans le bilan ────────────────────
  {
    const l = (label, extra) => ({ label, cat: 'fixed', v: Array(12).fill(10),
      paid: Array(12).fill(false), noEnd: true, ...(extra || {}) });

    DATA = { '2025': annee(), '2026': annee(), '2027': annee() };
    ['2025', '2026', '2027'].forEach(y => {
      DATA[y].charges = [l('Loyer'), l('Internet')];
      DATA[y].revenus = [l('Salaire')];
    });
    // Deux lignes de 2025 manquent dans 2026 ET 2027, une de 2026 manque dans 2027
    DATA['2025'].revenus.push(l('Vente moto (reste)'));
    DATA['2025'].charges.push(l('Remboursement Christine'));
    DATA['2026'].charges.push(l('Abonnement train'));

    const brut = _lignesAbsentesDesSuivantes();
    const groupes = _manquesGroupes();
    check('bilan · le brut compte une entrée par année cible',
      brut.length === 5, brut.length);
    check('bilan · le regroupement ramène à une entrée par ligne',
      groupes.length === 3, groupes.length);

    const moto = groupes.find(g => g.label === 'Vente moto (reste)');
    check('bilan · les années cibles sont rassemblées',
      moto && moto.cibles.join() === '2026,2027', moto && moto.cibles.join());
    check('bilan · la section d’origine est conservée',
      moto && moto.section === 'revenus', moto && moto.section);
    check('bilan · l’indice de la ligne permet de l’ouvrir',
      moto && DATA['2025'].revenus[moto.ri] &&
      DATA['2025'].revenus[moto.ri].label === 'Vente moto (reste)',
      moto && moto.ri);

    const train = groupes.find(g => g.label === 'Abonnement train');
    check('bilan · une ligne de 2026 ne vise que 2027',
      train && train.annee === '2026' && train.cibles.join() === '2027',
      train && `${train.annee} → ${train.cibles.join()}`);

    check('bilan · toutes les lignes sont retournées, sans plafond',
      groupes.length === new Set(brut.map(m => `${m.section}|${m.annee}|${m.label}`)).size,
      `${groupes.length} vs ${new Set(brut.map(m => `${m.section}|${m.annee}|${m.label}`)).size}`);

    // Données saines : aucun groupe
    DATA['2026'].charges.push(l('Remboursement Christine'));
    DATA['2027'].charges.push(l('Remboursement Christine'));
    DATA['2026'].revenus.push(l('Vente moto (reste)'));
    DATA['2027'].revenus.push(l('Vente moto (reste)'));
    DATA['2027'].charges.push(l('Abonnement train'));
    check('bilan · plus aucun groupe une fois les lignes reportées',
      _manquesGroupes().length === 0, JSON.stringify(_manquesGroupes().map(g => g.label)));
  }

  // ── « Propre à cette année — ne pas reporter » ──────────────────────────
  {
    const l = (label, extra) => ({ label, cat: 'fixed', v: Array(12).fill(10),
      paid: Array(12).fill(false), noEnd: true, ...(extra || {}) });

    DATA = { '2025': annee(), '2026': annee(), '2027': annee() };
    ['2025', '2026', '2027'].forEach(y => {
      DATA[y].charges = [l('Loyer')];
      DATA[y].revenus = [l('Salaire')];
    });
    const vente = l('Vente moto (reste)');
    DATA['2025'].revenus.push(vente);

    check('ne pas reporter · signalée tant qu’elle n’est pas marquée',
      _manquesGroupes().some(g => g.label === 'Vente moto (reste)'),
      JSON.stringify(_manquesGroupes().map(g => g.label)));

    vente.noCarry = true;
    check('ne pas reporter · marquée, elle disparaît du bilan',
      !_manquesGroupes().some(g => g.label === 'Vente moto (reste)'),
      JSON.stringify(_manquesGroupes().map(g => g.label)));
    check('ne pas reporter · le bilan n’a plus rien à signaler là-dessus',
      _bilanSante().find(c => c.titre.startsWith('Lignes présentes')).ok,
      _bilanSante().find(c => c.titre.startsWith('Lignes présentes')).souci);

    // Elle ne doit pas masquer les autres lignes réellement manquantes
    DATA['2025'].charges.push(l('Ramonage'));
    check('ne pas reporter · les autres manques restent détectés',
      _manquesGroupes().length === 1 && _manquesGroupes()[0].label === 'Ramonage',
      JSON.stringify(_manquesGroupes().map(g => g.label)));

    // Une charge marquée aussi
    DATA['2025'].charges[1].noCarry = true;
    check('ne pas reporter · fonctionne aussi sur une charge',
      _manquesGroupes().length === 0, JSON.stringify(_manquesGroupes().map(g => g.label)));

    // Le drapeau n'affecte pas les calculs de l'année où la ligne vit
    DATA['2025'].revenus[1].v[2] = 16250;
    DATA['2025'].revenus[1].paid[2] = true;
    check('ne pas reporter · le montant reste pris en compte dans son année',
      DATA['2025'].revenus[1].v[2] === 16250 && DATA['2025'].revenus[1].noCarry === true,
      JSON.stringify(DATA['2025'].revenus[1].v.slice(0, 4)));
  }

  // ── Sauvegardes cloud (clichés quotidiens) ──────────────────────────────
  {
    const vraiFetch = window._fbFetch;
    const vraiToken = window.fbGetToken;
    const vraieBase = window.cloudSnapshotsBase;
    const BASE = 'https://exemple.test/userdata/u1/snapshots';
    const cleJour = 'budget_cloudsnap_' + CURRENT_USER_ID;

    let appels = [];
    let clesDistantes = {};
    let refuser = false;
    const reponse = (ok, corps) => ({ ok, status: ok ? 200 : 401, json: async () => corps });

    window.cloudSnapshotsBase = () => BASE;
    window.fbGetToken = async () => 'jeton';
    window._fbFetch = async (url, opt = {}) => {
      appels.push({ url, methode: opt.method || 'GET', corps: opt.body });
      if (refuser) return reponse(false, null);
      if (url.includes('shallow=true')) return reponse(true, clesDistantes);
      if ((opt.method || 'GET') === 'PUT') { clesDistantes[url.split('/').pop().replace('.json', '')] = true; return reponse(true, {}); }
      if (opt.method === 'DELETE') { delete clesDistantes[url.split('/').pop().replace('.json', '')]; return reponse(true, {}); }
      return reponse(true, {});
    };
    const reset = () => { appels = []; try { localStorage.removeItem(cleJour); } catch {} };

    // Chemin : nœud frère de budget, jamais vu par la fusion
    check('clichés · le chemin est un nœud frère de budget',
      _snapshotsBaseFor('abc').endsWith('/userdata/abc/snapshots') &&
      !_snapshotsBaseFor('abc').includes('/budget'),
      _snapshotsBaseFor('abc'));
    check('clichés · sans identifiant, aucun chemin', _snapshotsBaseFor(null) === null);

    DATA = { '2026': annee() };
    DATA['2026'].charges = [{ label: 'Loyer', cat: 'fixed', v: Array(12).fill(5), paid: Array(12).fill(false) }];

    // Écriture du jour
    reset(); clesDistantes = {};
    await cloudSnapshotMaybe();
    const jour = new Date().toISOString().slice(0, 10);
    const put = appels.find(a => a.methode === 'PUT');
    check('clichés · un PUT est envoyé pour la date du jour',
      !!put && put.url === `${BASE}/${jour}.json`, put && put.url);
    check('clichés · le cliché contient les données et la version',
      !!put && (() => { const o = JSON.parse(put.corps); return !!o.data && !!o.app && !!o.at; })(),
      put && put.corps?.slice(0, 60));
    check('clichés · la liste est demandée en shallow, pas en entier',
      appels.some(a => a.url.includes('shallow=true')),
      appels.map(a => a.url).join(' | '));

    // Pas deux fois le même jour
    appels = [];
    await cloudSnapshotMaybe();
    check('clichés · pas de second cliché le même jour',
      appels.length === 0, appels.map(a => a.methode).join());

    // Élagage au-delà du maximum
    reset(); appels = [];
    clesDistantes = {};
    for (let i = 1; i <= 14; i++) clesDistantes[`2026-01-${String(i).padStart(2, '0')}`] = true;
    await cloudSnapshotMaybe();
    const supprimes = appels.filter(a => a.methode === 'DELETE');
    check('clichés · les plus anciens sont retirés au-delà du maximum',
      supprimes.length === 15 - CLOUD_SNAPSHOTS_MAX,
      `${supprimes.length} suppression(s) pour ${Object.keys(clesDistantes).length} clé(s)`);
    check('clichés · ce sont bien les plus anciens qui partent',
      supprimes.every(a => a.url.includes('2026-01-0')),
      supprimes.map(a => a.url.split('/').pop()).join());

    // Un refus du serveur ne doit rien casser ni marquer le jour comme fait
    reset(); appels = []; refuser = true;
    let aLeve = false;
    try { await cloudSnapshotMaybe(); } catch { aLeve = true; }
    check('clichés · un refus serveur ne lève jamais', !aLeve);
    check('clichés · le jour n’est pas marqué comme fait après un refus',
      localStorage.getItem(cleJour) !== jour, localStorage.getItem(cleJour));
    refuser = false;

    // Données vides : rien ne part, le cloud ne doit pas recevoir un budget vide
    reset(); appels = [];
    const sauveD = DATA; DATA = {};
    await cloudSnapshotMaybe();
    check('clichés · aucun cliché pour des données vides',
      appels.length === 0, appels.map(a => a.methode).join());
    DATA = sauveD;

    window._fbFetch = vraiFetch;
    window.fbGetToken = vraiToken;
    window.cloudSnapshotsBase = vraieBase;
    reset();
  }

  // ── Année ouverte par défaut ─────────────────────────────────────────────
  {
    const AN = String(new Date().getFullYear());
    const SUIV = String(new Date().getFullYear() + 1);
    const PREC = String(new Date().getFullYear() - 1);

    DATA = { [PREC]: annee(), [AN]: annee(), [SUIV]: annee() };
    check('année par défaut · l’année en cours prime sur la dernière créée',
      _anneeParDefaut() === AN, _anneeParDefaut());

    DATA = { [PREC]: annee(), [AN]: annee() };
    check('année par défaut · l’année en cours quand c’est la plus récente',
      _anneeParDefaut() === AN, _anneeParDefaut());

    // Année en cours absente : repli sur la plus récente disponible
    DATA = { [PREC]: annee(), [SUIV]: annee() };
    check('année par défaut · repli sur la plus récente si l’année en cours manque',
      _anneeParDefaut() === SUIV, _anneeParDefaut());

    DATA = {};
    check('année par défaut · chaîne vide si aucune année',
      _anneeParDefaut() === '', JSON.stringify(_anneeParDefaut()));

    // L’onglet Graphiques suit la même règle
    DATA = { [PREC]: annee(), [AN]: annee(), [SUIV]: annee() };
    _chartYear = '';
    const srcCharts = String(window.renderCharts);
    check('année par défaut · les graphiques passent par la même règle',
      srcCharts.includes('_anneeParDefaut()'), 'renderCharts n’utilise pas _anneeParDefaut');
  }

  // ── Trésorerie prévisionnelle ────────────────────────────────────────────
  {
    const AN = String(new Date().getFullYear());
    const moisNow = new Date().getMonth();
    const PREC = String(new Date().getFullYear() - 1);

    const ligne = (label, v, paid, extra) => ({ label, cat: 'fixed', v, paid, ...(extra || {}) });
    const douze = x => Array(12).fill(x);

    DATA = { [AN]: annee() };
    DATA[AN].soldes.compteIng = 1000;
    DATA[AN].soldes.compteIngSet = true;
    // Un revenu de 500 tous les mois, payé jusqu'au mois en cours seulement
    const rev = ligne('Salaire', douze(500), douze(false).map((_, i) => i <= moisNow));
    DATA[AN].revenus = [rev];
    DATA[AN].charges = [];

    let s = _tresorerieProjetee(AN, 'acc_main');
    check('trésorerie · douze points, un par mois', s.length === 12, s.length);
    check('trésorerie · les mois révolus sont marqués réels',
      s.filter(p => p.reel).length === moisNow + 1, s.filter(p => p.reel).length);

    // LA propriété essentielle : au mois en cours, la courbe vaut le solde affiché
    const auMoisCourant = s[moisNow].solde;
    check('trésorerie · elle rejoint exactement le solde calculé',
      Math.abs(auMoisCourant - computeCompte(AN, 'acc_main')) < 0.005,
      `${auMoisCourant} vs ${computeCompte(AN, 'acc_main')}`);

    // Les mois à venir comptent même ce qui n'est pas coché payé
    if (moisNow < 11) {
      check('trésorerie · un revenu futur non coché est quand même projeté',
        s[11].solde > s[moisNow].solde, `${s[11].solde} vs ${s[moisNow].solde}`);
    }

    // Une charge future creuse le solde au bon mois
    if (moisNow < 11) {
      const creux = douze(0); creux[11] = 3000;
      DATA[AN].charges = [ligne('Travaux', creux, douze(false), { noEnd: true })];
      s = _tresorerieProjetee(AN, 'acc_main');
      const bas = _pointBasTresorerie(AN, 'acc_main');
      check('trésorerie · une charge future est bien retranchée',
        Math.abs(s[11].solde - (s[10].solde + 500 - 3000)) < 0.005,
        `${s[11].solde} attendu ${s[10].solde + 500 - 3000}`);
      check('trésorerie · le point bas est le minimum des mois à venir',
        bas && bas.solde === Math.min(...s.filter(p => !p.reel).map(p => p.solde)),
        bas && bas.solde);
    }

    // Une charge PASSÉE non cochée ne doit pas peser : le passé, c'est le constaté
    const passe = douze(0); passe[0] = 9999;
    DATA[AN].charges = [ligne('Jamais payée', passe, douze(false), { noEnd: true })];
    const avecNonPayee = _tresorerieProjetee(AN, 'acc_main')[moisNow].solde;
    DATA[AN].charges = [];
    const sansRien = _tresorerieProjetee(AN, 'acc_main')[moisNow].solde;
    check('trésorerie · une charge passée non cochée n’est pas comptée',
      Math.abs(avecNonPayee - sansRien) < 0.005, `${avecNonPayee} vs ${sansRien}`);

    // fromBank : une variation de valeur ne touche pas le compte courant
    const vers = douze(0); vers[11] = 200;
    DATA[AN].charges = [ligne('Vers livret', vers, douze(true), { cat: 'livret_in' })];
    const avecVersement = _tresorerieProjetee(AN, 'acc_main')[11].solde;
    DATA[AN].charges = [ligne('Plus-value', vers, douze(true), { cat: 'livret_in', fromBank: true })];
    const avecPlusValue = _tresorerieProjetee(AN, 'acc_main')[11].solde;
    check('trésorerie · un versement vers livret sort du compte',
      Math.abs(avecVersement - (avecPlusValue - 200)) < 0.005,
      `${avecVersement} vs ${avecPlusValue - 200}`);
    check('trésorerie · une plus-value ne touche pas le compte',
      Math.abs(avecPlusValue - sansRien - 500 * (11 - moisNow)) < 0.005,
      `${avecPlusValue}`);

    // Une année entièrement passée n'a pas de point bas à venir
    DATA = { [PREC]: annee() };
    DATA[PREC].revenus = [ligne('Salaire', douze(500), douze(true))];
    check('trésorerie · aucun point bas pour une année révolue',
      _pointBasTresorerie(PREC, 'acc_main') === null,
      JSON.stringify(_pointBasTresorerie(PREC, 'acc_main')));
    check('trésorerie · pas de série pour une année inexistante',
      _tresorerieProjetee('1999', 'acc_main').length === 0);
  }

  // ── Annuler / rétablir ───────────────────────────────────────────────────
  {
    const AN = String(new Date().getFullYear());
    DATA = { [AN]: annee() };
    DATA[AN].charges = [{ label: 'Loyer', cat: 'fixed', v: Array(12).fill(10), paid: Array(12).fill(false) }];
    _undoPile = []; _redoPile = []; _jsonPrecedent = null;

    const libelles = () => DATA[AN].charges.map(c => c.label).join('|');
    saveData(true);                               // amorce : fixe l'état de référence
    check('annuler · rien à annuler au départ', _undoPile.length === 0, _undoPile.length);

    DATA[AN].charges.push({ label: 'A', cat: 'fixed', v: Array(12).fill(1), paid: Array(12).fill(false) });
    saveData(true);
    DATA[AN].charges.push({ label: 'B', cat: 'fixed', v: Array(12).fill(2), paid: Array(12).fill(false) });
    saveData(true);
    check('annuler · chaque enregistrement empile l’état précédent',
      _undoPile.length === 2, _undoPile.length);

    annulerDerniere();
    check('annuler · revient à l’état d’avant', libelles() === 'Loyer|A', libelles());
    annulerDerniere();
    check('annuler · deux fois remonte de deux crans', libelles() === 'Loyer', libelles());
    retablirDerniere();
    check('rétablir · revient en avant', libelles() === 'Loyer|A', libelles());

    // Une nouvelle action doit couper le fil du rétablissement
    DATA[AN].charges.push({ label: 'C', cat: 'fixed', v: Array(12).fill(3), paid: Array(12).fill(false) });
    saveData(true);
    check('annuler · une nouvelle action vide la pile de rétablissement',
      _redoPile.length === 0, _redoPile.length);

    // Une annulation ne doit pas s'empiler elle-même, sinon on boucle
    const avant = _undoPile.length;
    annulerDerniere();
    check('annuler · l’annulation ne s’empile pas elle-même',
      _undoPile.length === avant - 1, `${_undoPile.length} vs ${avant - 1}`);

    // Un enregistrement sans changement ne doit rien empiler
    const stable = _undoPile.length;
    saveData(true); saveData(true);
    check('annuler · un enregistrement sans modification n’empile rien',
      _undoPile.length === stable, `${_undoPile.length} vs ${stable}`);

    // Plafond de la pile
    for (let i = 0; i < UNDO_MAX + 5; i++) {
      DATA[AN].charges.push({ label: 'X' + i, cat: 'fixed', v: Array(12).fill(1), paid: Array(12).fill(false) });
      saveData(true);
    }
    check('annuler · la pile est plafonnée', _undoPile.length <= UNDO_MAX, _undoPile.length);

    _undoPile = []; _redoPile = []; _jsonPrecedent = null;
  }

  // ── Suivi d'un prêt ──────────────────────────────────────────────────────
  {
    const ref = new Date(2026, 9, 1);              // 1er octobre 2026
    const pret = { label: 'Prêt voiture', cat: 'fixed', v: Array(12).fill(300),
      paid: Array(12).fill(true), noEnd: false, endMonth: 11, endYear: 2028 };

    let p = _pretInfo(pret, ref);
    // (2028−2026)×12 + (11−9) + 1 = 27 échéances
    check('prêt · nombre d’échéances restantes', p.nb === 27, p.nb);
    check('prêt · total restant = mensualités × échéances', p.totalRestant === 8100, p.totalRestant);
    check('prêt · sans taux, capital restant = total restant',
      p.capitalRestant === 8100 && p.interets === 0, `${p.capitalRestant} / ${p.interets}`);

    pret.tauxPret = 3.25;
    p = _pretInfo(pret, ref);
    // Convention ACTUARIELLE : i = (1+t)^(1/12) − 1, et non t/12.
    const i = Math.pow(1 + 3.25 / 100, 1 / 12) - 1;
    const attendu = Math.round(300 * (1 - Math.pow(1 + i, -27)) / i * 100) / 100;
    check('prêt · capital restant dû conforme à la valeur actualisée',
      Math.abs(p.capitalRestant - attendu) < 0.01, `${p.capitalRestant} vs ${attendu}`);
    check('prêt · le taux mensuel suit la convention actuarielle, pas t/12',
      Math.abs(p.capitalRestant - 300 * (1 - Math.pow(1 + 3.25 / 100 / 12, -27)) / (3.25 / 100 / 12)) > 0.5,
      'le calcul semble encore diviser le taux par 12');

    // Contrôle sur un contrat réel : prêt à tempérament ING, 7 000 € à 4,65 %
    // actuariel, 36 mensualités de 208,39 €, intérêts totaux annoncés 502,04 €.
    // Reconstituer le capital emprunté à partir des seules mensualités est le
    // meilleur test possible de la formule.
    {
      const reel = { label: 'Prêt ING', cat: 'fixed', v: Array(12).fill(208.39),
        paid: Array(12).fill(true), noEnd: false,
        endMonth: 8, endYear: 2028, tauxPret: 4.65 };
      // 36 échéances restantes = situation à l'origine (1re échéance 10/2025)
      const origine = _pretInfo(reel, new Date(2025, 9, 1));
      check('prêt · 36 échéances reconstituent le capital du contrat',
        origine.nb === 36 && Math.abs(origine.capitalRestant - 7000) < 1,
        `${origine.nb} échéances, ${origine.capitalRestant} € (attendu ~7000)`);
      check('prêt · intérêts totaux conformes au contrat',
        Math.abs(origine.interets - 502.04) < 1,
        `${origine.interets} € (attendu ~502,04)`);
    }
    check('prêt · capital + intérêts = total restant',
      Math.abs(p.capitalRestant + p.interets - p.totalRestant) < 0.01,
      `${p.capitalRestant} + ${p.interets} ≠ ${p.totalRestant}`);
    check('prêt · un taux plus élevé laisse moins de capital',
      _pretInfo({ ...pret, tauxPret: 8 }, ref).capitalRestant < p.capitalRestant);

    // Échéance passée
    check('prêt · plus rien à payer après l’échéance',
      _pretInfo(pret, new Date(2029, 0, 1)).nb === 0,
      _pretInfo(pret, new Date(2029, 0, 1)).nb);

    // Une ligne sans date de fin n'est pas un engagement
    check('prêt · aucune information sans date de fin',
      _pretInfo({ ...pret, noEnd: true }, ref) === null);
    check('prêt · aucune information sans montant',
      _pretInfo({ ...pret, v: Array(12).fill(0), paid: Array(12).fill(false) }, ref) === null);
  }

  // ── Reprise d'une ligne à date de fin dans les années créées ensuite ─────
  // Le cas d'un prêt : la date de fin doit suffire à le reconduire jusqu'à sa
  // dernière échéance, puis l'arrêter — sans rien cocher d'autre.
  {
    const pret = { label: 'Prêt voiture', cat: 'occasional', v: Array(12).fill(208.39),
      paid: Array(12).fill(true), noEnd: false, endMonth: 8, endYear: 2028 };

    check('reprise · une année avant la fin reprend la ligne entière',
      _repriseAnnee(pret, 2027)?.dernierMois === 11, JSON.stringify(_repriseAnnee(pret, 2027)));
    check('reprise · l’année de la dernière échéance s’arrête à ce mois',
      _repriseAnnee(pret, 2028)?.dernierMois === 8, JSON.stringify(_repriseAnnee(pret, 2028)));
    check('reprise · l’année suivante ne reprend plus la ligne',
      _repriseAnnee(pret, 2029) === null, JSON.stringify(_repriseAnnee(pret, 2029)));

    // Le type de ligne ne change rien : occasionnelle ou récurrente, même sort
    check('reprise · le type de ligne n’influe pas',
      JSON.stringify(_repriseAnnee({ ...pret, cat: 'fixed' }, 2028)) ===
      JSON.stringify(_repriseAnnee(pret, 2028)));

    // Sans date de fin, la ligne est reprise indéfiniment
    check('reprise · une ligne sans fin est toujours reprise',
      _repriseAnnee({ ...pret, noEnd: true }, 2035)?.dernierMois === 11);

    // « Propre à cette année » et ajustements de solde ne sont jamais repris
    check('reprise · une ligne marquée « ne pas reporter » est exclue',
      _repriseAnnee({ ...pret, noCarry: true }, 2027) === null);
    check('reprise · un ajustement de solde réel est exclu',
      _repriseAnnee({ ...pret, _adjust: true }, 2027) === null);

    // Les lignes de livret échappent à la date de fin (elles sont protégées)
    check('reprise · un mouvement de livret est repris malgré une fin passée',
      _repriseAnnee({ ...pret, cat: 'livret_in' }, 2030)?.dernierMois === 11,
      JSON.stringify(_repriseAnnee({ ...pret, cat: 'livret_in' }, 2030)));
  }

  // ── L'onglet consulté est restauré après un rechargement ─────────────
  {
    const src = String(window._finishLogin || '');
    check('onglet · la restauration est bien appelée au démarrage',
      src.includes('_restoreLastTab()'),
      '_restoreLastTab n’est appelée nulle part — le code était mort jusqu’à la 13.63');
    // `_anneeParDefaut()` apparaît plus tôt dans la fonction pour un autre usage :
    // c'est la bascule finale, `const targetY = ...`, qui doit céder le pas.
    check('onglet · elle a priorité sur la bascule vers l’année par défaut',
      src.includes('if (_restoreLastTab()) return;') &&
      src.indexOf('if (_restoreLastTab()) return;') < src.indexOf('const targetY = _anneeParDefaut()'),
      'la bascule vers l’année par défaut s’applique avant la restauration');
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
    // Laisser la chaîne de démarrage se terminer avant d'évaluer quoi que ce soit.
    // Les cas sont asynchrones depuis l'ajout des clichés cloud : sans ce délai,
    // les minuteries de l'application (rappels, restauration d'onglet) s'intercalent
    // entre deux `await` et peuvent provoquer une navigation, qui détruit le
    // contexte d'exécution en plein milieu des tests.
    await new Promise(r => setTimeout(r, 2500));

    const version = await page.evaluate(() => `${APP_VERSION} / SW ${SW_VERSION}`);
    console.log(`\nMon Budget ${version}\n`);

    const resultats = [...verificationsSource(), ...await page.evaluate(tousLesCas)];
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
