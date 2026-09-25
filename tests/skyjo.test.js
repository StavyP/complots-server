// skyjo.test.js — Règles de Skyjo (moteur seul, sans réseau).
// Lancer : node --test tests/skyjo.test.js   (depuis server/)
//
// Après chaque scénario, l'invariant « 150 cartes en jeu » est vérifié
// (pioche + défausse + grilles + carte en main).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SkyjoRoom, nouveauPaquet } = require('../jeux/skyjo.js');
const { fakeClock } = require('./aide');

/** Nombre total de cartes en jeu : doit toujours valoir 150. */
function cartes(room) {
  const g = room.g;
  const grids = g.seats.reduce((t, s) => t + s.grid.filter((c) => !c.gone).length, 0);
  return g.deck.length + g.discard.length + grids + (g.held !== null ? 1 : 0);
}

/**
 * Partie déterministe : p0..p(n-1) assis dans l'ordre. `grids[i]` impose les
 * 12 valeurs du joueur i (toutes cachées) ; la pioche est recomposée pour
 * garder 150 cartes ; `top` = carte de la défausse ; `deckTop` = prochaines
 * cartes piochées (la première d'abord).
 */
function setup({ n = 3, grids = [], top = 5, deckTop = [], settings = null } = {}) {
  const clock = fakeClock();
  const room = new SkyjoRoom('TEST', { clock });
  for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + (i + 1), 's' + i);
  if (settings) assert.equal(room.setSettings('p0', settings), null);
  assert.equal(room.start('p0'), null);
  const g = room.g;
  g.seats.sort((a, b) => a.id.localeCompare(b.id));
  const pool = nouveauPaquet();
  const take = (v) => {
    const k = pool.indexOf(v);
    assert.ok(k >= 0, `plus de ${v} dans le paquet`);
    pool.splice(k, 1);
    return v;
  };
  g.seats.forEach((s, i) => {
    const vals = grids[i] || [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
    s.grid = vals.map((v) => ({ v: take(v), up: false, gone: false }));
    s.revealed = 0;
  });
  g.discard = [take(top)];
  const front = deckTop.map(take);
  g.deck = [...pool, ...front.reverse()];
  assert.equal(cartes(room), 150);
  return { room, clock, g };
}

/** Phase de révélation : chacun retourne les cases données (2 par joueur). */
function reveal(room, picks = []) {
  room.g.seats.forEach((s, i) => {
    for (const k of picks[i] || [0, 1]) assert.equal(room.actReveal(s.id, { i: k }), true);
  });
}

/** Grille entièrement visible : `a` en case 0, des 0 ailleurs (score = a). */
const visible = (a) => Array.from({ length: 12 }, (_, k) => ({ v: k === 0 ? a : 0, up: true, gone: false }));

/**
 * Fin de manche contrôlée : les joueurs reçoivent les grilles données (toutes
 * visibles sauf la case 11 du fermeur, qui vaut 0), `closer` ferme en
 * retournant cette case, puis chacun des autres joue un dernier tour neutre
 * (il reprend la carte qu'il vient de défausser… en échangeant un 0 contre un 0).
 */
function finirManche(room, closer, scores) {
  const g = room.g;
  g.seats.forEach((s, i) => { s.grid = visible(scores[i]); });
  room.seat(closer).grid[11].up = false;
  g.cur = closer;
  g.step = 'choose';
  g.deck.push(0);
  assert.equal(room.actDraw(closer), true);
  assert.equal(room.actDiscard(closer), true);
  assert.equal(room.actFlip(closer, { i: 11 }), true);
  let guard = 0;
  while (g.step !== 'roundEnd' && room.phase === 'play' && guard++ < 20) {
    const p = g.cur;
    g.deck.push(0);
    room.actDraw(p);
    room.actPlace(p, { i: 5 });
  }
}

test('paquet officiel : 150 cartes, 5 × −2, 10 × −1, 15 × 0, 10 × chaque 1..12', () => {
  const d = nouveauPaquet();
  assert.equal(d.length, 150);
  const count = (v) => d.filter((x) => x === v).length;
  assert.equal(count(-2), 5);
  assert.equal(count(-1), 10);
  assert.equal(count(0), 15);
  for (let v = 1; v <= 12; v++) assert.equal(count(v), 10);
});

test('mise en place : 12 cartes cachées, invisibles même pour leur propriétaire', () => {
  const room = new SkyjoRoom('T', { clock: fakeClock() });
  room.addPlayer('a', 'A', 's');
  room.addPlayer('b', 'B', 't');
  assert.equal(room.start('a'), null);
  const v = room.viewFor('a').game;
  assert.equal(v.seats.length, 2);
  for (const s of v.seats) {
    assert.equal(s.grid.length, 12);
    assert.ok(s.grid.every((c) => c.v === null && !c.up));
  }
  assert.equal(v.step, 'reveal');
  assert.equal(cartes(room), 150);
});

test('révélation : 2 cartes chacun, pas une de plus ; le plus gros total commence', () => {
  const { room, g } = setup({ grids: [
    [1, 1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    [12, 11, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    [7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
  ], top: 4 });
  assert.equal(room.actReveal('p0', { i: 0 }), true);
  assert.equal(room.actReveal('p0', { i: 0 }), false, 'carte déjà visible');
  assert.equal(room.actReveal('p0', { i: 1 }), true);
  assert.equal(room.actReveal('p0', { i: 2 }), false, 'troisième carte refusée');
  assert.equal(g.step, 'reveal');
  room.actReveal('p1', { i: 0 }); room.actReveal('p1', { i: 1 });
  room.actReveal('p2', { i: 0 }); room.actReveal('p2', { i: 1 });
  assert.equal(g.step, 'choose');
  assert.equal(g.cur, 'p1', '12 + 11 = 23, le plus gros total');
});

test('prendre la défausse oblige à échanger (impossible de la reposer)', () => {
  const { room, g } = setup({ top: -2 });
  reveal(room);
  const cur = g.cur;
  assert.equal(room.actTake(cur), true);
  assert.equal(g.held, -2);
  assert.equal(room.actDiscard(cur), false);
  const s = room.seat(cur);
  const old = s.grid[5].v;
  assert.equal(room.actPlace(cur, { i: 5 }), true);
  assert.equal(s.grid[5].v, -2);
  assert.equal(s.grid[5].up, true);
  assert.equal(g.discard.at(-1), old, 'la carte remplacée va sur la défausse');
  assert.notEqual(g.cur, cur);
  assert.equal(cartes(room), 150);
});

test('piocher puis refuser : la carte va à la défausse, il faut retourner une carte CACHÉE', () => {
  const { room, g } = setup({ deckTop: [9] });
  reveal(room);
  const cur = g.cur;
  assert.equal(room.actFlip(cur, { i: 3 }), false, 'pas encore');
  assert.equal(room.actDraw(cur), true);
  assert.equal(g.held, 9);
  assert.equal(room.actDiscard(cur), true);
  assert.equal(g.discard.at(-1), 9);
  assert.equal(g.step, 'flip');
  assert.equal(room.actFlip(cur, { i: 0 }), false, 'carte déjà visible');
  assert.equal(room.actFlip(cur, { i: 7 }), true);
  assert.equal(room.seat(cur).grid[7].up, true);
  assert.notEqual(g.cur, cur);
  assert.equal(cartes(room), 150);
});

test('piocher puis échanger avec une carte cachée', () => {
  const { room, g } = setup({ deckTop: [-1] });
  reveal(room);
  const cur = g.cur;
  room.actDraw(cur);
  assert.equal(room.actPlace(cur, { i: 9 }), true);
  assert.equal(room.seat(cur).grid[9].v, -1);
  assert.equal(cartes(room), 150);
});

test('seul le joueur dont c’est le tour peut jouer', () => {
  const { room, g } = setup();
  reveal(room);
  const other = g.seats.find((s) => s.id !== g.cur).id;
  assert.equal(room.actDraw(other), false);
  assert.equal(room.actTake(other), false);
});

test('colonne de 3 cartes identiques visibles : retirée et posée sur la défausse', () => {
  // Colonne 0 = cases 0, 4, 8.
  const { room, g } = setup({ grids: [[7, 1, 2, 3, 7, 1, 2, 3, 4, 4, 4, 4]], top: 7 });
  reveal(room, [[0, 4]]);
  g.cur = 'p0';
  g.step = 'choose';
  const before = g.discard.length;
  assert.equal(room.actTake('p0'), true);
  assert.equal(room.actPlace('p0', { i: 8 }), true);
  const s = room.seat('p0');
  assert.ok([0, 4, 8].every((k) => s.grid[k].gone), 'colonne retirée');
  // −1 (défausse prise) +1 (le 4 remplacé) +3 (la colonne)
  assert.equal(g.discard.length, before + 3);
  assert.equal(g.discard.at(-1), 7);
  assert.equal(cartes(room), 150);
  assert.ok(room.fx.some((f) => f.type === 'column' && f.pid === 'p0' && f.col === 0));
});

test('une ligne identique ne compte pas (colonnes seulement)', () => {
  const { room, g } = setup({ grids: [[2, 2, 9, 9, 1, 1, 1, 1, 3, 3, 3, 3]], top: 2 });
  reveal(room, [[0, 1]]);
  g.cur = 'p0';
  g.step = 'choose';
  room.actTake('p0');
  room.actPlace('p0', { i: 2 });
  room.seat('p0').grid[3].up = true;
  assert.ok(!room.seat('p0').grid.some((c) => c.gone));
});

test('fin de manche : celui qui a tout révélé ferme, chacun des autres rejoue une fois', () => {
  const { room, g } = setup({ n: 3, deckTop: [1, 1, 1, 1] });
  reveal(room);
  g.cur = 'p1';
  g.step = 'choose';
  room.seat('p1').grid.forEach((c, k) => { if (k !== 11) c.up = true; });
  room.actDraw('p1');
  room.actDiscard('p1');
  room.actFlip('p1', { i: 11 });
  assert.equal(g.closer, 'p1');
  assert.deepEqual([...g.lastTurns].sort(), ['p0', 'p2']);
  assert.equal(g.cur, 'p2');
  room.actDraw('p2'); room.actDiscard('p2'); room.actFlip('p2', { i: 5 });
  assert.equal(g.cur, 'p0');
  room.actDraw('p0'); room.actDiscard('p0'); room.actFlip('p0', { i: 5 });
  assert.equal(g.step, 'roundEnd', 'retour au fermeur : fin de manche');
  assert.ok(g.seats.every((s) => s.grid.every((c) => c.up || c.gone)), 'tout est révélé');
  assert.equal(g.result.length, 3);
  assert.equal(cartes(room), 150);
});

test('score doublé : le fermeur sans le plus petit score voit son score positif doublé', () => {
  const { room, g } = setup({ n: 2 });
  reveal(room);
  finirManche(room, 'p0', [10, 4]);
  const r0 = g.result.find((r) => r.id === 'p0');
  assert.equal(r0.raw, 10);
  assert.equal(r0.doubled, true);
  assert.equal(r0.score, 20);
  assert.equal(g.seats[0].total, 20);
  assert.equal(g.seats[1].total, 4);
});

test('score doublé aussi à égalité (il faut être STRICTEMENT le plus bas)', () => {
  const { room, g } = setup({ n: 2 });
  reveal(room);
  finirManche(room, 'p0', [6, 6]);
  const r0 = g.result.find((r) => r.id === 'p0');
  assert.equal(r0.doubled, true);
  assert.equal(r0.score, 12);
});

test('jamais doublé si le score du fermeur est nul ou négatif', () => {
  for (const [a, b] of [[0, -2], [-1, -2]]) {
    const { room, g } = setup({ n: 2 });
    reveal(room);
    finirManche(room, 'p0', [a, b]);
    const r0 = g.result.find((r) => r.id === 'p0');
    assert.equal(r0.doubled, false, `score ${a}`);
    assert.equal(r0.score, a);
  }
});

test('pas doublé si le fermeur a strictement le plus petit score', () => {
  const { room, g } = setup({ n: 3 });
  reveal(room);
  finirManche(room, 'p2', [9, 8, 1]);
  const r2 = g.result.find((r) => r.id === 'p2');
  assert.equal(r2.doubled, false);
  assert.equal(r2.score, 1);
});

test('colonnes identiques révélées au décompte : retirées aussi', () => {
  const { room, g } = setup({ n: 2 });
  reveal(room);
  g.seats[0].grid = visible(0);
  g.seats[1].grid = [8, 1, 2, 3, 8, 2, 3, 4, 8, 3, 4, 5].map((v, k) => ({ v, up: ![0, 4, 11].includes(k), gone: false }));
  g.closer = 'p0';
  g.lastTurns = ['p1'];
  g.cur = 'p1';
  g.step = 'choose';
  g.deck.push(1);
  room.actDraw('p1');
  room.actPlace('p1', { i: 11 });
  assert.equal(g.step, 'roundEnd');
  assert.ok([0, 4, 8].every((k) => g.seats[1].grid[k].gone), 'les trois 8 révélés disparaissent');
  // 1+2+3 + 2+3+4 + 3+4+1 (le 5 remplacé par le 1 pioché)
  assert.equal(g.result.find((r) => r.id === 'p1').raw, 23);
});

test('manche suivante : tous prêts → nouvelle manche, le fermeur commence', () => {
  const { room, g } = setup({ n: 3 });
  reveal(room);
  finirManche(room, 'p2', [9, 8, 1]);
  assert.equal(room.actReady('p0'), true);
  assert.equal(g.step, 'roundEnd');
  room.actReady('p1');
  room.actReady('p2');
  assert.equal(g.round, 2);
  assert.equal(g.step, 'reveal');
  assert.equal(cartes(room), 150);
  g.seats[0].grid[0].v = 12;
  g.seats[0].grid[1].v = 12;
  reveal(room);
  assert.equal(g.cur, 'p2', 'le fermeur, même avec un plus petit total');
});

test('manche suivante : un joueur déconnecté n’est pas attendu ; l’hôte peut forcer', () => {
  const { room, g } = setup({ n: 3 });
  reveal(room);
  finirManche(room, 'p1', [9, 1, 5]);
  room.disconnect('p2', 's2');
  assert.equal(room.actForce('p1'), false, 'pas l’hôte');
  room.actReady('p0');
  room.actReady('p1');
  assert.equal(g.round, 2);
  finirManche(room, 'p1', [9, 1, 5]);
  assert.equal(room.actForce('p0'), true);
  assert.equal(g.round, 3);
});

test('fin de partie : un total atteint la cible → le plus petit total gagne (égalité : co-vainqueurs)', () => {
  const { room, g } = setup({ n: 3, settings: { cible: 50, tour: 0 } });
  reveal(room);
  g.seats[0].total = 45;
  g.seats[1].total = 20;
  g.seats[2].total = 20;
  finirManche(room, 'p0', [9, 3, 3]);
  assert.equal(room.phase, 'ended');
  assert.equal(g.seats[0].total, 45 + 18, '9 doublé');
  assert.deepEqual([...room.winnerIds].sort(), ['p1', 'p2']);
});

test('pioche vide : la défausse (sauf sa carte du dessus) est remélangée', () => {
  const { room, g } = setup({ n: 2 });
  reveal(room);
  g.discard.push(...g.deck.splice(0));
  const top = g.discard.at(-1);
  const cur = g.cur;
  assert.equal(room.actDraw(cur), true);
  assert.equal(g.discard.length, 1);
  assert.equal(g.discard[0], top, 'la carte visible reste sur la défausse');
  assert.equal(cartes(room), 150);
});

test('joueur déconnecté : son coup est joué automatiquement au bout de 20 s', () => {
  const { room, clock, g } = setup({ n: 3 });
  reveal(room);
  const cur = g.cur;
  room.disconnect(cur, room.player(cur).socketId);
  clock.advance(19000);
  assert.equal(g.cur, cur);
  clock.advance(1500);
  assert.notEqual(g.cur, cur, 'le tour est passé');
  assert.equal(cartes(room), 150);
});

test('minuterie de tour : coup automatique quand le temps est écoulé', () => {
  const { room, clock, g } = setup({ n: 2, settings: { cible: 100, tour: 30 } });
  reveal(room);
  const cur = g.cur;
  assert.ok(room.timerInfo, 'minuterie visible');
  clock.advance(29000);
  assert.equal(g.cur, cur);
  clock.advance(2000);
  assert.notEqual(g.cur, cur);
  assert.equal(cartes(room), 150);
});

test('révélation : un absent retourne ses 2 cartes tout seul', () => {
  const clock = fakeClock();
  const room = new SkyjoRoom('T', { clock });
  room.addPlayer('a', 'A', 's');
  room.addPlayer('b', 'B', 't');
  room.start('a');
  room.actReveal('a', { i: 0 });
  room.actReveal('a', { i: 1 });
  room.disconnect('b', 't');
  clock.advance(21000);
  assert.equal(room.g.step, 'choose');
});

test('départ en pleine partie : le tour passe ; dernier restant → il gagne', () => {
  const { room, g } = setup({ n: 3 });
  reveal(room);
  const cur = g.cur;
  room.actDraw(cur);
  room.removePlayer(cur);
  assert.notEqual(g.cur, cur);
  assert.equal(g.step, 'choose');
  assert.equal(cartes(room), 150, 'la carte en main est rendue à la défausse');
  const rest = g.seats.filter((s) => s.id !== cur).map((s) => s.id);
  room.removePlayer(rest[0]);
  assert.equal(room.phase, 'ended');
  assert.deepEqual(room.winnerIds, [rest[1]]);
});

test('départ pendant le dernier tour : la manche se termine sans lui', () => {
  const { room, g } = setup({ n: 3 });
  reveal(room);
  g.cur = 'p0';
  g.step = 'choose';
  room.seat('p0').grid.forEach((c, k) => { if (k !== 11) c.up = true; });
  room.actDraw('p0'); room.actDiscard('p0'); room.actFlip('p0', { i: 11 });
  assert.equal(g.cur, 'p1');
  room.removePlayer('p2');
  room.actDraw('p1'); room.actDiscard('p1'); room.actFlip('p1', { i: 7 });
  assert.equal(g.step, 'roundEnd');
  assert.equal(g.result.length, 2);
});

test('réglages : cible et minuterie validées', () => {
  const room = new SkyjoRoom('T', { clock: fakeClock() });
  room.addPlayer('a', 'A', 's');
  assert.ok(room.setSettings('a', { cible: 42 }));
  assert.ok(room.setSettings('a', { tour: 5 }));
  assert.equal(room.setSettings('a', { cible: 150, tour: 60 }), null);
  assert.deepEqual(room.settings, { cible: 150, tour: 60 });
});
