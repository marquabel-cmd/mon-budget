# Tests & outillage

## Lancer les tests

```bash
node tests/run.js
```

Prérequis : `puppeteer` installé localement (`npm install --no-save puppeteer`).
Les tests chargent `budget_familial.html` dans un Chrome sans interface, servi
par un petit serveur statique éphémère, et exercent les fonctions de calcul là
où elles tournent pour de bon.

L'application est un fichier HTML unique dont tout le code tient dans un seul
bloc `<script>` : ses fonctions ne peuvent pas être importées depuis Node, d'où
ce détour par un vrai navigateur.

## Ce qui est couvert

Les régressions testées sont celles qui ont réellement atteint l'utilisateur :

| Domaine | Ce qui est vérifié |
|---|---|
| `_decideSync` | Les quatre motifs d'arbitrage, et l'absence de tout repli sur les horloges |
| `_mergeBudgetData` | Listes noires de suppression d'année, réinjection des transactions |
| `_ordreAAligner` | Report de l'ordre des lignes, jamais vers les années passées |
| `computeLivret` / `computeCompte` | Soldes chaînés, `fromBank`, mois payés |
| `switchTab` | Redessin d'un onglet d'année à l'arrivée |

## Ajouter un test

Une entrée dans la fonction `tousLesCas()` de `run.js`. Chaque cas dispose de
`check(nom, condition, detail)` et travaille sur un `DATA` jetable, restauré
automatiquement ensuite.

**Attention** : `DATA` est déclaré `let DATA;` dans l'application, donc ce n'est
pas une propriété de `window`. Écrire `DATA = …` et non `window.DATA = …`,
sinon on crée une variable parallèle que l'application ne voit pas.

## Vérifier qu'un test mord vraiment

Un test qui passe toujours ne vaut rien. Pour s'en assurer, réintroduire
volontairement le bug qu'il est censé attraper, constater l'échec, puis
restaurer le fichier. C'est ainsi que cette suite a été validée, sur le repli
des horloges et sur la résurrection des années supprimées.

## Publier une version

```bash
node tools/release.js          # version suivante (13.51 → 13.52)
node tools/release.js 14.00    # version explicite
node tools/release.js --check  # vérifie la cohérence, ne modifie rien
```

Le numéro de version vit à **quatre endroits** qui doivent toujours concorder :

| Fichier | Marqueur |
|---|---|
| `budget_familial.html` | `const APP_VERSION = '13.51';` |
| `budget_familial.html` | `const SW_VERSION = 'v331';` |
| `sw.js` | `const CACHE = 'mon-budget-v331';` |
| `version.json` | `{"v":"13.51"}` |

Les oublier est déjà arrivé : `version.json` est resté à 13.41 alors que
l'application annonçait 13.47, et la bannière de mise à jour ne pouvait plus
fonctionner.

La commande refuse de publier si les tests échouent ou si l'entrée de changelog
de la nouvelle version manque — une version sans changelog est invisible pour
l'utilisateur. Écrire l'entrée de changelog **avant** de lancer la commande.
