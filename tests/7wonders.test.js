// 7wonders.test.js — Règles de 7 Wonders, édition 2020 (moteur seul, sans réseau).
// Lancer : node --test tests/7wonders.test.js   (depuis server/)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SevenRoom, CARD, WONDER, solveCost, science } = require('../jeux/7wonders.js');
const { fakeClock } = require('./aide');

/**
 * Partie à n joueurs, sièges p0..p(n-1) dans l'ordre (p1 à droite de p0,
 * p(n-1) à sa gauche), merveilles imposées, face A, âge I lancé.
 */
function setup({ n = 3, wonders = ['Gizah', 'Babylon', 'Olympia', 'Rhodos', 'Ephesos', 'Alexandria', 'Halikarnassus'], sides = null, settings = null } = {}) {
  const clock = fakeClock();
  const room = new SevenRoom('TEST', { clock });
  for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + (i + 1), 's' + i);
  if (settings) assert.equal(room.setSettings('p0', settings), null);
  assert.equal(room.start('p0'), null);
  const g = room.g;
  g.seats.sort((a, b) => a.id.localeCompare(b.id));
  g.seats.forEach((s, i) => { s.wonder = wonders[i]; s.side = null; s.prod = { fixed: {}, choices: [], sellable: {} }; });
  g.seats.forEach((s, i) => room.setSide(s, sides?.[i] || 'A'));
  g.phase = 'sides';
  room.startAge(1);
  return { room, clock, g, S: (i) => g.seats[i] };
}

/** Donne une main précise à chacun (noms de cartes). */
function hands(room, list) { room.g.seats.forEach((s, i) => { if (list[i]) s.hand = [...list[i]]; }); }
/** Tout le monde défausse sa première carte, sauf les coups imposés. */
function playTurn(room, moves = {}) {
  for (const s of room.g.seats) {
    if (s.action) continue; // automate : a déjà choisi
    const m = moves[s.id] || { type: 'discard', card: s.hand[0] };
    assert.equal(room.actMove(s.id, m), true, `${s.id} ${m.type} ${m.card}`);
  }
}

test('paquets : 7 cartes par joueur à chaque âge ; âge III avec joueurs + 2 guildes', () => {
  for (let n = 3; n <= 7; n++) {
    const { room, g } = setup({ n });
    assert.ok(g.seats.every((s) => s.hand.length === 7));
    g.age = 2;
    room.startAge(3);
    const all = g.seats.flatMap((s) => s.hand);
    assert.equal(all.length, 7 * n);
    assert.equal(all.filter((c) => CARD[c].color === 'PURPLE').length, n + 2);
  }
});

test('la Merveille produit sa ressource de départ ; 3 pièces au début', () => {
  const { S } = setup();
  assert.equal(S(0).prod.fixed.S, 1, 'Gizeh : pierre');
  assert.equal(S(1).prod.fixed.W, 1, 'Babylone (2020) : bois');
  assert.equal(S(2).prod.fixed.C, 1, 'Olympie (2020) : argile');
  assert.ok(S(0).coins === 3);
});

test('construire en payant ses ressources ; carte gratuite ; défausse = +3 pièces', () => {
  const { room, S } = setup();
  hands(room, [['Baths', 'Altar'], ['Altar', 'Baths'], ['Clay Pit', 'Baths']]);
  playTurn(room, { p0: { type: 'build', card: 'Baths' }, p1: { type: 'build', card: 'Altar' }, p2: { type: 'build', card: 'Clay Pit' } });
  assert.deepEqual(S(0).built, ['Baths'], 'Thermes payés avec la pierre de Gizeh');
  assert.equal(S(0).coins, 3);
  assert.equal(S(2).coins, 2, 'Carrière d’argile coûte 1 pièce');
  const { room: r2, S: T } = setup();
  hands(r2, [['Baths'], ['Altar'], ['Altar']]);
  playTurn(r2, { p1: { type: 'discard', card: 'Altar' } });
  assert.equal(T(1).coins, 6);
});

test('commerce : acheter aux voisins 2 pièces l’unité, payées au voisin', () => {
  const { room, S } = setup();
  // p0 (Gizeh, pierre) veut la Palissade (bois) : son voisin de droite p1 (Babylone) produit du bois.
  const three = ['Altar', 'Baths', 'Theater'];
  hands(room, [['Stockade', 'Altar', 'Baths'], three, three]);
  const v = room.viewFor('p0').game.me.hand[0];
  assert.deepEqual(v.build, { coins: 2, left: 0, right: 2, chain: false });
  playTurn(room, { p0: { type: 'build', card: 'Stockade' } });
  assert.equal(S(0).coins, 1);
  assert.equal(S(1).coins, 3 + 3 + 2, 'défausse + vente');
});

test('comptoirs : ressources brunes à 1 pièce du côté indiqué', () => {
  const { room, S } = setup();
  room.effect(S(0), CARD['East Trading Post'].effect);
  hands(room, [['Stockade'], ['Altar'], ['Altar']]);
  assert.deepEqual(room.viewFor('p0').game.me.hand[0].build, { coins: 1, left: 0, right: 1, chain: false });
});

test('on n’achète pas ce qu’un voisin produit avec une carte jaune ni sa merveille (Alexandrie)', () => {
  const self = { fixed: {}, choices: [], sellable: {} };
  const left = { fixed: {}, choices: [{ options: ['W', 'S', 'O', 'C'], sellable: false }], sellable: {} };
  const right = { fixed: { W: 1 }, choices: [], sellable: {} };
  assert.equal(solveCost('W', self, left, right, {}).ok, false);
});

test('coût minimal : la production propre à choix d’abord, puis le voisin le moins cher', () => {
  const self = { fixed: {}, choices: [{ options: ['W', 'C'], sellable: true }], sellable: {} };
  const left = { fixed: { W: 1 }, choices: [], sellable: { W: 1 } };
  const right = { fixed: { W: 1, C: 1 }, choices: [], sellable: { W: 1, C: 1 } };
  const r = solveCost('WC', self, left, right, { W: { RIGHT_PLAYER: 1 }, C: { RIGHT_PLAYER: 1 } });
  assert.deepEqual(r, { ok: true, coins: 1, left: 0, right: 1 });
});

test('chaînage : gratuit si on possède la carte parente', () => {
  const { room, S } = setup();
  S(0).built.push('Baths');
  room.g.age = 2;
  S(0).hand = ['Aqueduct'];
  const t = room.viewFor('p0').game.me.hand[0];
  assert.equal(t.build.chain, true);
  assert.equal(t.build.coins, 0);
});

test('jamais deux bâtiments identiques', () => {
  const { room, S } = setup();
  S(0).built.push('Altar');
  hands(room, [['Altar', 'Baths'], ['Altar'], ['Altar']]);
  const v = room.viewFor('p0').game.me.hand[0];
  assert.equal(v.build, null);
  assert.equal(v.dup, true);
  assert.equal(room.actMove('p0', { type: 'build', card: 'Altar' }), false);
});

test('les pièces gagnées pendant le tour ne servent pas ce tour-là', () => {
  const { room, S } = setup();
  S(0).coins = 0;
  S(1).coins = 0;
  // p1 (Babylone, argile) achète de la pierre à p0 ; p0 n'a pas de quoi payer 1 pièce ce tour.
  hands(room, [['Clay Pit'], ['Baths'], ['Altar']]);
  assert.equal(room.viewFor('p0').game.me.hand[0].build, null);
});

test('étape de Merveille : la carte glisse dessous (pas dans la défausse)', () => {
  const { room, S, g } = setup();
  const three = ['Altar', 'Baths', 'Theater'];
  hands(room, [three, three, three]);
  S(0).prod.fixed.W = 2; // Gizeh Jour (2020), étape 1 : 2 bois
  playTurn(room, { p0: { type: 'wonder', card: 'Altar' } });
  assert.deepEqual(S(0).stages, [true, false, false]);
  assert.equal(S(0).under, 1);
  assert.equal(g.discard.length, 2, 'seules les défausses des 2 autres : l’Autel de p0 est sous sa merveille');
});

test('les mains tournent à gauche aux âges I et III, à droite à l’âge II', () => {
  const { room, g, S } = setup();
  hands(room, [['Altar', 'Baths', 'Theater'], ['Clay Pit', 'Stone Pit', 'Ore Vein'], ['Loom', 'Press', 'Glassworks']]);
  playTurn(room);
  // âge I : p0 reçoit la main de p1 (son voisin de droite la lui passe… vers sa gauche).
  assert.deepEqual(S(0).hand, ['Stone Pit', 'Ore Vein']);
  g.age = 2;
  hands(room, [['Altar', 'Baths', 'Theater'], ['Clay Pit', 'Stone Pit', 'Ore Vein'], ['Loom', 'Press', 'Glassworks']]);
  playTurn(room);
  assert.deepEqual(S(0).hand, ['Press', 'Glassworks']);
});

test('fin d’âge : 7e carte défaussée, conflits 1/3/5 et −1', () => {
  const { room, g, S } = setup();
  S(0).shields = 2; S(1).shields = 1; S(2).shields = 0;
  g.seats.forEach((s) => { s.hand = ['Altar', 'Baths']; });
  playTurn(room);
  assert.equal(g.age, 2, 'âge II commencé');
  assert.deepEqual(S(0).tokens.sort(), [1, 1]);
  assert.deepEqual(S(1).tokens.sort(), [-1, 1]);
  assert.deepEqual(S(2).tokens.sort(), [-1, -1]);
  assert.ok(g.discard.length >= 6);
});

test('science : carrés + 7 par série, jokers au mieux', () => {
  assert.equal(science({ COMPASS: 1, WHEEL: 1, TABLET: 1 }, 0), 10);
  assert.equal(science({ COMPASS: 3, WHEEL: 0, TABLET: 0 }, 0), 9);
  assert.equal(science({ COMPASS: 2, WHEEL: 2, TABLET: 1 }, 1), 26);
  assert.equal(science({ COMPASS: 0, WHEEL: 0, TABLET: 0 }, 2), 4);
});

test('Babylone B : peut jouer sa 7e carte', () => {
  const { room, g, S } = setup({ sides: ['A', 'B', 'A'] });
  room.effect(S(1), { action: 'PLAY_LAST_CARD' });
  g.seats.forEach((s) => { s.hand = ['Altar', 'Baths']; });
  S(1).hand = ['Altar', 'Theater'];
  playTurn(room);
  assert.equal(g.phase, 'last');
  assert.deepEqual(g.lastHolders, ['p1']);
  assert.equal(room.actMove('p1', { type: 'build', card: 'Theater' }), true);
  assert.ok(S(1).built.includes('Theater'));
  assert.equal(g.age, 2);
});

test('Halicarnasse : construit gratuitement une carte de la défausse (y compris les 7es cartes)', () => {
  const { room, g, S } = setup({ wonders: ['Halikarnassus', 'Babylon', 'Olympia'] });
  S(0).prod.fixed.G = 1; S(0).prod.fixed.P = 1; // Halicarnasse Jour, étape 2 : verre + papyrus
  S(0).stages = [true, false, false];
  g.seats.forEach((s) => { s.hand = ['Altar', 'Baths']; });
  S(2).hand = ['Theater', 'Baths'];
  playTurn(room, { p0: { type: 'wonder', card: 'Altar' }, p2: { type: 'discard', card: 'Theater' } });
  assert.equal(g.phase, 'special');
  assert.equal(g.special.type, 'halicarnasse');
  const opts = room.viewFor('p0').game.special.options;
  assert.ok(opts.includes('Theater'));
  assert.ok(opts.includes('Baths'), 'les 7es cartes de fin d’âge sont déjà défaussées');
  assert.equal(room.viewFor('p1').game.special.options, null, 'les autres ne voient pas la défausse');
  assert.equal(room.actDiscardPick('p0', { card: 'Theater' }), true);
  assert.ok(S(0).built.includes('Theater'));
  assert.equal(g.age, 2, 'puis conflits et âge suivant');
});

test('Olympie Jour : la 1re carte de chaque couleur est gratuite', () => {
  const { room, S } = setup({ wonders: ['Olympia', 'Babylon', 'Gizah'] });
  room.effect(S(0), { action: 'FIRST_OF_COLOR_FREE' });
  S(0).coins = 0;
  S(0).built.push('Altar'); // déjà une carte bleue
  hands(room, [['Palace', 'Laboratory', 'Baths'], ['Altar', 'Baths', 'Theater'], ['Altar', 'Baths', 'Theater']]);
  const h = room.viewFor('p0').game.me.hand;
  assert.equal(h[0].free, null, 'Palais : il a déjà une carte bleue');
  assert.equal(h[1].free, 'couleur', 'Laboratoire : 1re verte');
  playTurn(room, { p0: { type: 'free', card: 'Laboratory' } });
  assert.ok(S(0).built.includes('Laboratory'));
  assert.equal(room.actMove('p0', { type: 'free', card: 'Baths' }), false);
});

test('Olympie Nuit : 1re et dernière carte de chaque âge gratuites', () => {
  const { room, g, S } = setup({ wonders: ['Olympia', 'Babylon', 'Gizah'], sides: ['B', 'A', 'A'] });
  room.effect(S(0), { action: 'FIRST_OF_AGE_FREE' });
  room.effect(S(0), { action: 'LAST_OF_AGE_FREE' });
  S(0).coins = 0;
  assert.equal(g.turn, 1);
  hands(room, [['Palace', 'Altar', 'Baths'], ['Altar', 'Baths', 'Theater'], ['Altar', 'Baths', 'Theater']]);
  assert.equal(room.viewFor('p0').game.me.hand[0].free, 'debut');
  playTurn(room, { p0: { type: 'free', card: 'Palace' } });
  assert.equal(g.turn, 2);
  assert.equal(room.viewFor('p0').game.me.hand[0].free, null, 'plus au 2e tour');
  g.turn = 6;
  assert.equal(room.viewFor('p0').game.me.hand[0].free, 'fin', 'dernière carte de l’âge');
});

test('fin de partie : décompte complet et égalité départagée aux pièces', () => {
  const { room, g, S } = setup();
  S(0).built = ['Palace', 'Arena'];
  S(0).stages = [true, true, false];
  S(0).tokens = [5, 5, -1];
  S(0).coins = 10;
  S(0).sci = { COMPASS: 1, WHEEL: 1, TABLET: 1 };
  const sc = room.scoreOf(S(0));
  assert.equal(sc.civil, 8);
  assert.equal(sc.merveille, 3 + 5, 'Gizeh A : 3 + 5');
  assert.equal(sc.commerce, 2, 'Arène : 1 PV par étape');
  assert.equal(sc.militaire, 9);
  assert.equal(sc.tresor, 3);
  assert.equal(sc.science, 10);
  assert.equal(sc.total, 8 + 8 + 2 + 9 + 3 + 10);
  g.age = 3;
  S(1).built = ['Palace', 'Arena']; S(1).stages = [true, true, false]; S(1).tokens = [5, 5, -1]; S(1).coins = 11; S(1).sci = { COMPASS: 1, WHEEL: 1, TABLET: 1 };
  S(1).wonder = 'Gizah'; S(1).side = 'A';
  g.seats.forEach((s) => { s.hand = ['Altar', 'Baths']; });
  playTurn(room);
  assert.equal(room.phase, 'ended');
  assert.deepEqual(room.winnerIds, ['p1'], 'même total, plus de pièces');
});

test('Guilde des décorateurs : 7 PV seulement si la Merveille est complète', () => {
  const { room, S } = setup();
  S(0).built = ['Decorators Guild'];
  S(0).stages = [true, true, false];
  assert.equal(room.scoreOf(S(0)).guildes, 0);
  S(0).stages = [true, true, true];
  assert.equal(room.scoreOf(S(0)).guildes, 7);
});

test('Ludus : 3 pièces par carte rouge à la construction, 1 PV par carte rouge à la fin', () => {
  const { room, S } = setup();
  S(0).built = ['Stockade', 'Barracks', 'Ludus'];
  S(0).coins = 0;
  room.effect(S(0), CARD['Ludus'].effect);
  room.settleGold();
  assert.equal(S(0).coins, 6);
  assert.equal(room.scoreOf(S(0)).commerce, 2);
});

test('catalogue 2020 : Puits, Autel/Théâtre à 3, Temple à 4, nouveaux chaînages, guildes', () => {
  assert.ok(CARD['Well'] && !CARD['Pawnshop']);
  assert.equal(CARD['Altar'].effect.points, 3);
  assert.equal(CARD['Theater'].effect.points, 3);
  assert.equal(CARD['Temple'].effect.points, 4);
  assert.deepEqual(CARD['Pantheon'].chainParents, ['Altar']);
  assert.deepEqual(CARD['Gardens'].chainParents, ['Theater']);
  assert.deepEqual(CARD['Statue'].chainParents, ['Well']);
  assert.equal(CARD['Fortifications'].cost.res, 'OOOC');
  assert.ok(CARD['Decorators Guild'] && !CARD['Strategists Guild']);
  assert.equal(WONDER.Babylon.sides.B.stages.length, 2);
  assert.equal(WONDER.Olympia.sides.A.initialResource, 'C');
});

test('absent : il défausse d’office au bout de 30 s ; face A si pas choisie', () => {
  const clock = fakeClock();
  const room = new SevenRoom('T', { clock });
  ['a', 'b', 'c'].forEach((x, i) => room.addPlayer(x, x, 's' + i));
  room.start('a');
  room.actSide('a', { side: 'B' });
  room.actSide('b', { side: 'A' });
  room.disconnect('c', 's2');
  clock.advance(31000);
  assert.equal(room.g.phase, 'play');
  assert.equal(room.seat('c').side, 'A');
  const s = room.seat('a');
  room.actMove('a', { type: 'discard', card: s.hand[0] });
  room.actMove('b', { type: 'discard', card: room.seat('b').hand[0] });
  clock.advance(31000);
  assert.equal(room.g.turn, 2);
});

test('un joueur qui part laisse un automate (le cercle reste complet)', () => {
  const { room, g, S } = setup({ n: 4 });
  room.removePlayer('p3');
  assert.equal(g.seats.length, 4);
  assert.ok(S(3).action, 'l’automate a déjà choisi');
  playTurn(room, {});
  assert.equal(g.turn, 2);
  assert.ok(S(3).action, 'et rechoisit à chaque tour');
});

test('faces imposées par l’hôte', () => {
  const clock = fakeClock();
  const room = new SevenRoom('T', { clock });
  ['a', 'b', 'c'].forEach((x, i) => room.addPlayer(x, x, 's' + i));
  room.setSettings('a', { faces: 'B', tour: 0 });
  room.start('a');
  assert.equal(room.g.phase, 'play');
  assert.ok(room.g.seats.every((s) => s.side === 'B'));
});

test('données d’affichage : toutes les cartes et merveilles', () => {
  assert.ok(Object.keys(CARD).length >= 70);
  assert.equal(Object.keys(WONDER).length, 7);
});
