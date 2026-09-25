'use strict';
// catalogue-2020.js — Produit jeux/7wonders-catalogue.js (7 Wonders, NOUVELLE
// ÉDITION 2020) à partir du catalogue de la 1re édition
// (outils/7wonders-catalogue-1re-edition.js), en appliquant les changements
// relevés le 2026-09-25 dans :
//   - la « Liste des cartes et chaînages » officielle 2020 (PDF du site
//     jeuxstrategieter.free.fr/7_wonders_2020_complet.php) : effets, nombre
//     de joueurs, chaînages de TOUTES les cartes ;
//   - les cartes et plateaux imprimés dans la règle 2020 et sur ce site
//     (coûts de Ludus, Guilde des décorateurs, plateaux Jour) ;
//   - assortedmeeples.com « 7 Wonders 1st vs 2nd edition » (coûts modifiés,
//     faces Nuit des merveilles).
// Coûts NON CONFIRMÉS (aucune image trouvée) : Puits (gratuit, comme le
// Prêteur sur gages qu'il remplace) et Castrum (CCWP). À vérifier sur la boîte.
// Lancer : node outils/catalogue-2020.js   (depuis server/)
const fs = require('fs');
const path = require('path');
const old = require('./7wonders-catalogue-1re-edition.js');

const cat = JSON.parse(JSON.stringify(old));
const find = (list, name) => {
  const c = cat[list].find((x) => x.name === name);
  if (!c) throw new Error(`carte absente : ${name}`);
  return c;
};
/** counts(3, 5) → une carte à partir de 3 joueurs, une deuxième à partir de 5. */
const counts = (...mins) => {
  const c = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (const m of mins) for (let n = m; n <= 7; n++) c[n]++;
  return c;
};

// ── Âge I ───────────────────────────────────────────────────────────────
cat.AGE1 = cat.AGE1.filter((c) => c.name !== 'Pawnshop');
cat.AGE1.push({ name: 'Well', color: 'BLUE', cost: { gold: 0, res: '' }, effect: { points: 3 }, chainParents: [], counts: counts(4, 7), unconfirmedCost: true });
find('AGE1', 'Altar').effect = { points: 3 };
find('AGE1', 'Theater').effect = { points: 3 };

// ── Âge II ──────────────────────────────────────────────────────────────
find('AGE2', 'Temple').effect = { points: 4 };
find('AGE2', 'Temple').chainParents = [];
find('AGE2', 'Statue').chainParents = ['Well'];

// ── Âge III ─────────────────────────────────────────────────────────────
find('AGE3', 'Pantheon').chainParents = ['Altar'];
find('AGE3', 'Gardens').chainParents = ['Theater'];
find('AGE3', 'Town Hall').counts = counts(3, 6);
find('AGE3', 'Arena').counts = counts(3, 5);
find('AGE3', 'Circus').counts = counts(4, 6);
find('AGE3', 'Arsenal').counts = counts(3, 5);
find('AGE3', 'Fortifications').cost = { gold: 0, res: 'OOOC' };
cat.AGE3.push({
  name: 'Ludus',
  color: 'YELLOW',
  cost: { gold: 0, res: 'SO' },
  effect: { perBoardElement: { boards: ['SELF'], type: 'CARD', colors: ['RED'], gold: 3, points: 1 } },
  chainParents: [],
  counts: counts(5, 7),
});
cat.AGE3.push({ name: 'Castrum', color: 'RED', cost: { gold: 0, res: 'CCWP' }, effect: { military: 3 }, chainParents: [], counts: counts(4, 7), unconfirmedCost: true });

// ── Guildes ─────────────────────────────────────────────────────────────
cat.GUILDS = cat.GUILDS.filter((c) => c.name !== 'Strategists Guild');
find('GUILDS', 'Builders Guild').cost = { gold: 0, res: 'SSSCCG' };
find('GUILDS', 'Spies Guild').cost = { gold: 0, res: 'CCG' };
cat.GUILDS.push({ name: 'Decorators Guild', color: 'PURPLE', cost: { gold: 0, res: 'OOSL' }, effect: { completedWonderPoints: 7 }, chainParents: [], counts: {} });

// ── Merveilles (face A = Jour, B = Nuit) ────────────────────────────────
const st = (cost, effect) => ({ cost, effect });
const any4 = { production: { resources: 'W/S/O/C', isSellable: false } };
cat.WONDERS = [
  { name: 'Alexandria', sides: {
    A: { initialResource: 'G', stages: [st('SS', { points: 3 }), st('OO', any4), st('PL', { points: 7 })] },
    B: { initialResource: 'G', stages: [st('CC', any4), st('OOO', { production: { resources: 'G/P/L', isSellable: false } }), st('WWWW', { points: 7 })] },
  } },
  { name: 'Babylon', sides: {
    A: { initialResource: 'W', stages: [st('CC', { points: 3 }), st('OOL', { science: 'any' }), st('WWWW', { points: 7 })] },
    B: { initialResource: 'W', stages: [st('SS', { action: 'PLAY_LAST_CARD' }), st('CCCG', { science: 'any' })] },
  } },
  { name: 'Ephesos', sides: {
    A: { initialResource: 'P', stages: [st('CC', { points: 3 }), st('WW', { gold: 9 }), st('OOG', { points: 7 })] },
    B: { initialResource: 'P', stages: [st('SS', { gold: 4, points: 2 }), st('WW', { gold: 4, points: 3 }), st('OOL', { gold: 4, points: 5 })] },
  } },
  { name: 'Gizah', sides: {
    A: { initialResource: 'S', stages: [st('WW', { points: 3 }), st('CCL', { points: 5 }), st('SSSS', { points: 7 })] },
    B: { initialResource: 'S', stages: [st('WW', { points: 3 }), st('SSS', { points: 5 }), st('CCC', { points: 5 }), st('SSSSP', { points: 7 })] },
  } },
  { name: 'Halikarnassus', sides: {
    A: { initialResource: 'L', stages: [st('OO', { points: 3 }), st('GP', { action: 'PLAY_DISCARDED' }), st('SSS', { points: 7 })] },
    B: { initialResource: 'L', stages: [st('CC', { points: 2, action: 'PLAY_DISCARDED' }), st('GP', { points: 1, action: 'PLAY_DISCARDED' }), st('WWW', { action: 'PLAY_DISCARDED' })] },
  } },
  { name: 'Olympia', sides: {
    A: { initialResource: 'C', stages: [st('SS', { points: 3 }), st('WW', { action: 'FIRST_OF_COLOR_FREE' }), st('CCC', { points: 7 })] },
    B: { initialResource: 'C', stages: [st('OO', { points: 2, action: 'FIRST_OF_AGE_FREE' }), st('CCC', { points: 3, action: 'LAST_OF_AGE_FREE' }), st('GPL', { points: 5 })] },
  } },
  { name: 'Rhodos', sides: {
    A: { initialResource: 'O', stages: [st('WW', { points: 3 }), st('CCC', { military: 2 }), st('OOOO', { points: 7 })] },
    B: { initialResource: 'O', stages: [st('SSS', { gold: 3, military: 1, points: 3 }), st('OOOO', { gold: 4, military: 1, points: 4 })] },
  } },
];

// Contrôles : 7 cartes par joueur à chaque âge (âge III : 6n − 2 + n + 2 guildes).
for (let n = 3; n <= 7; n++) {
  const tot = (list) => cat[list].reduce((t, c) => t + (c.counts[n] || 0), 0);
  if (tot('AGE1') !== 7 * n || tot('AGE2') !== 7 * n || tot('AGE3') !== 6 * n - 2) {
    throw new Error(`mauvais nombre de cartes à ${n} joueurs : ${tot('AGE1')} / ${tot('AGE2')} / ${tot('AGE3')}`);
  }
}
if (cat.GUILDS.length !== 10) throw new Error('10 guildes attendues');

const head = `'use strict';
// 7wonders-catalogue.js — Cartes et merveilles de 7 Wonders, NOUVELLE
// ÉDITION 2020. FICHIER GÉNÉRÉ par outils/catalogue-2020.js (sources et
// coûts non confirmés : voir ce script) — ne pas modifier à la main.
// Lettres des ressources : W bois, S pierre, O minerai, C argile, G verre,
// P papyrus, L tissu. Noms internes en anglais, noms français dans le client.
`;
fs.writeFileSync(path.join(__dirname, '..', 'jeux', '7wonders-catalogue.js'), `${head}module.exports = ${JSON.stringify(cat, null, 2)};\n`);
console.log('catalogue 2020 écrit :', cat.AGE1.length, cat.AGE2.length, cat.AGE3.length, 'cartes par âge,', cat.GUILDS.length, 'guildes');
