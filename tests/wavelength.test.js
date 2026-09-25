// wavelength.test.js — Règles de Wavelength (moteur seul, sans réseau).
// Lancer : node --test tests/wavelength.test.js   (depuis server/)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WavelengthRoom, points, appreciation } = require('../jeux/wavelength.js');
const { fakeClock } = require('./aide');

/** n joueurs p0..; en mode équipes, p0,p2,… équipe 0 et p1,p3,… équipe 1. */
function setup({ n = 4, mode = 'auto', cible = 10 } = {}) {
  const clock = fakeClock();
  const room = new WavelengthRoom('TEST', { clock });
  for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + (i + 1), 's' + i);
  for (let i = 0; i < n; i++) room.teamOf['p' + i] = i % 2;
  assert.equal(room.setSettings('p0', { mode, cible }), null);
  assert.equal(room.start('p0'), null);
  return { room, clock, g: room.g };
}

/** Joue un tour complet : le médium choisit, donne un indice, l'équipe place le cadran à `offset` de la cible. */
function tour(room, { offset = 0, lr = null, lrLock = true } = {}) {
  const g = room.g;
  assert.equal(room.actPick(g.psychic, { index: 0 }), true);
  assert.equal(room.actClue(g.psychic, { clue: 'indice' }), true);
  const guesser = room.guessers()[0];
  const target = g.target;
  assert.equal(room.actDial(guesser, { value: target + offset }), true);
  if (Math.abs(g.dial - (target + offset)) > 0.051) {
    // Cadran borné à [0, 100] : on ramène la cible pour garder l'écart voulu.
    g.target = g.dial - offset;
  }
  assert.equal(room.actLock(guesser), true);
  if (g.phase === 'lr') {
    const opp = room.opponents()[0];
    if (lr) assert.equal(room.actLR(opp, { side: lr }), true);
    else assert.equal(room.actLR(opp, { side: 'left' }), true);
    if (lrLock) assert.equal(room.actLRLock(opp), true);
  }
}

test('zones : 4 au centre, puis 3, puis 2 ; sur une limite, la meilleure des deux', () => {
  assert.equal(points(50, 50), 4);
  assert.equal(points(50, 52), 4, 'limite 4/3 → 4');
  assert.equal(points(50, 52.1), 3);
  assert.equal(points(50, 44), 3, 'limite 3/2 → 3');
  assert.equal(points(50, 43.9), 2);
  assert.equal(points(50, 60), 2);
  assert.equal(points(50, 60.1), 0);
});

test('auto : équipes à partir de 4 joueurs, coopératif en dessous', () => {
  assert.equal(setup({ n: 4 }).g.mode, 'equipes');
  assert.equal(setup({ n: 3 }).g.mode, 'coop');
  assert.equal(setup({ n: 2 }).g.mode, 'coop');
});

test('équipes : l’équipe qui commence part de 0, l’autre de 1', () => {
  const { g } = setup({ n: 4 });
  assert.equal(g.scores[g.turnTeam], 0);
  assert.equal(g.scores[1 - g.turnTeam], 1);
});

test('équipes : il faut au moins 2 joueurs par équipe', () => {
  const clock = fakeClock();
  const room = new WavelengthRoom('T', { clock });
  for (let i = 0; i < 4; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
  ['p0', 'p1', 'p2'].forEach((id) => { room.teamOf[id] = 0; });
  room.teamOf.p3 = 1;
  room.setSettings('p0', { mode: 'equipes', cible: 10 });
  assert.match(room.start('p0'), /au moins 2 joueurs/);
});

test('le médium seul voit la cible et les deux spectres proposés', () => {
  const { room, g } = setup({ n: 4 });
  const other = room.guessers()[0];
  assert.ok(room.viewFor(g.psychic).game.target !== null);
  assert.equal(room.viewFor(other).game.target, null);
  assert.equal(room.viewFor(g.psychic).game.options.length, 2);
  assert.equal(room.viewFor(other).game.options, null);
});

test('seuls les équipiers du médium bougent le cadran ; l’autre équipe parie gauche/droite', () => {
  const { room, g } = setup({ n: 4 });
  room.actPick(g.psychic, { index: 1 });
  room.actClue(g.psychic, { clue: 'Mon indice' });
  assert.equal(room.actDial(g.psychic, { value: 10 }), false, 'pas le médium');
  const opp = room.opponents()[0];
  assert.equal(room.actDial(opp, { value: 10 }), false, 'pas l’équipe adverse');
  const mate = room.guessers()[0];
  assert.equal(room.actDial(mate, { value: 33.33 }), true);
  assert.equal(g.dial, 33.3);
  assert.equal(room.actLR(opp, { side: 'left' }), false, 'pas encore');
  room.actLock(mate);
  assert.equal(g.phase, 'lr');
  assert.equal(room.actLR(mate, { side: 'left' }), false, 'pas l’équipe active');
  assert.equal(room.actLRLock(opp), false, 'il faut d’abord choisir');
  assert.equal(room.actLR(opp, { side: 'right' }), true);
  assert.equal(room.actLRLock(opp), true);
  assert.equal(g.phase, 'reveal');
});

test('pari gauche/droite juste : +1 pour l’autre équipe', () => {
  const { room, g } = setup({ n: 4 });
  const active = g.turnTeam;
  const before = [...g.scores];
  tour(room, { offset: 8, lr: 'left' }); // cadran à droite de la cible → « à gauche » est juste
  assert.equal(g.result.points, 2);
  assert.equal(g.result.lrPoints, 1);
  assert.equal(g.scores[active], before[active] + 2);
  assert.equal(g.scores[1 - active], before[1 - active] + 1);
});

test('pari faux : rien ; et pas de point adverse si l’équipe active fait 4', () => {
  {
    const { room, g } = setup({ n: 4 });
    const before = [...g.scores];
    tour(room, { offset: 8, lr: 'right' });
    assert.equal(g.result.lrPoints, 0);
    assert.equal(g.scores[1 - g.turnTeam], before[1 - g.turnTeam]);
  }
  {
    const { room, g } = setup({ n: 4 });
    const before = [...g.scores];
    tour(room, { offset: 1, lr: 'left' });
    assert.equal(g.result.points, 4);
    assert.equal(g.result.lrPoints, 0, 'le pari juste ne rapporte rien face à un 4');
    assert.equal(g.scores[1 - g.turnTeam], before[1 - g.turnTeam]);
  }
});

test('les équipes alternent ; le médium change à chaque fois dans l’équipe', () => {
  const { room, g } = setup({ n: 6 });
  const t0 = g.turnTeam;
  const psy0 = g.psychic;
  tour(room, { offset: 30 });
  room.actNext('p0');
  assert.equal(g.turnTeam, 1 - t0);
  tour(room, { offset: 30 });
  room.actNext('p0');
  assert.equal(g.turnTeam, t0);
  assert.notEqual(g.psychic, psy0, 'un autre médium de la même équipe');
});

test('rattrapage : un 4 alors qu’on reste derrière → on rejoue aussitôt, autre médium', () => {
  const { room, g } = setup({ n: 4 });
  const t = g.turnTeam;
  g.scores[t] = 0;
  g.scores[1 - t] = 7;
  const psy = g.psychic;
  tour(room, { offset: 0 });
  assert.equal(g.result.catchUp, true);
  room.actNext('p1');
  assert.equal(g.turnTeam, t);
  assert.equal(g.catchUp, true);
  assert.notEqual(g.psychic, psy);
});

test('pas de rattrapage si le 4 fait passer devant', () => {
  const { room, g } = setup({ n: 4 });
  const t = g.turnTeam;
  g.scores[t] = 5;
  g.scores[1 - t] = 7;
  tour(room, { offset: 0 });
  assert.equal(g.result.catchUp, false);
  room.actNext('p0');
  assert.equal(g.turnTeam, 1 - t);
});

test('victoire à 10 : la partie s’arrête, la meilleure équipe gagne', () => {
  const { room, g } = setup({ n: 4 });
  const t = g.turnTeam;
  g.scores[t] = 8;
  g.scores[1 - t] = 5;
  tour(room, { offset: 5, lr: 'right' }); // 3 points → 11
  assert.equal(room.phase, 'ended');
  assert.deepEqual([...room.winnerIds].sort(), room.teamIds(t).sort());
  assert.equal(room.summary.team, t);
});

test('égalité au-delà de 10 : chaque équipe rejoue jusqu’à départager', () => {
  const { room, g } = setup({ n: 4 });
  const t = g.turnTeam;
  g.scores[t] = 8;
  g.scores[1 - t] = 10;
  tour(room, { offset: 8, lr: 'right' }); // +2 → 10 partout
  assert.equal(room.phase, 'play');
  assert.equal(g.scores[t], 10);
  room.actNext('p0');
  tour(room, { offset: 30 }); // l'autre équipe : 0 → pas encore fini (chacun doit rejouer)
  assert.equal(room.phase, 'play');
  room.actNext('p0');
  tour(room, { offset: 8, lr: 'right' }); // l'équipe t marque 2
  assert.equal(room.phase, 'ended');
  assert.equal(room.summary.team, t);
});

test('coopératif : 7 cartes, le centre vaut 3 et ajoute une carte, pas de gauche/droite', () => {
  const { room, g } = setup({ n: 3 });
  assert.equal(g.coop.total, 7);
  tour(room, { offset: 0 });
  assert.equal(g.phase, 'reveal', 'pas de phase gauche/droite');
  assert.equal(g.coop.score, 3);
  assert.equal(g.coop.total, 8, 'carte bonus');
  room.actNext('p0');
  tour(room, { offset: 5 });
  assert.equal(g.coop.score, 6);
  for (let k = 2; k < 8; k++) { room.actNext('p0'); tour(room, { offset: 30 }); }
  assert.equal(room.phase, 'ended');
  assert.equal(room.summary.score, 6);
  assert.equal(room.summary.appreciation, appreciation(6));
  assert.equal(room.winnerIds.length, 3, 'tout le monde gagne ensemble');
});

test('barème coopératif de la boîte', () => {
  assert.equal(appreciation(0), 'Tu es sûr que c’est branché ?');
  assert.equal(appreciation(12), 'Pas mal ! Pas génial, mais pas mal.');
  assert.equal(appreciation(16), 'Vous avez gagné !');
  assert.equal(appreciation(30), 'Explosion de cerveau 🤯');
});

test('le médium tourne entre tous en coopératif', () => {
  const { room, g } = setup({ n: 3 });
  const seen = new Set([g.psychic]);
  for (let k = 0; k < 2; k++) { tour(room, { offset: 30 }); room.actNext('p0'); seen.add(g.psychic); }
  assert.equal(seen.size, 3);
});

test('salon : chacun choisit son équipe, l’hôte peut mélanger', () => {
  const room = new WavelengthRoom('T', { clock: fakeClock() });
  for (let i = 0; i < 4; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
  assert.deepEqual([0, 1, 2, 3].map((i) => room.teamOf['p' + i]), [0, 1, 0, 1], 'équilibrage à l’arrivée');
  assert.equal(room.actTeam('p1', { team: 0 }), true);
  assert.equal(room.teamOf.p1, 0);
  assert.equal(room.actShuffleTeams('p1'), false, 'pas l’hôte');
  assert.equal(room.actShuffleTeams('p0'), true);
  const counts = [0, 1].map((t) => Object.values(room.teamOf).filter((x) => x === t).length);
  assert.deepEqual(counts, [2, 2]);
  assert.equal(room.viewFor('p2').modeEffectif, 'equipes');
});

test('médium absent : un autre médium de l’équipe prend la main au bout de 30 s', () => {
  const { room, clock, g } = setup({ n: 6 });
  const psy = g.psychic;
  const team = g.turnTeam;
  room.disconnect(psy, room.player(psy).socketId);
  clock.advance(31000);
  assert.notEqual(g.psychic, psy);
  assert.equal(g.turnTeam, team);
  assert.equal(g.phase, 'pick');
});

test('départ du médium en plein tour : nouveau médium de la même équipe', () => {
  const { room, g } = setup({ n: 6 });
  const psy = g.psychic;
  room.actPick(psy, { index: 0 });
  room.removePlayer(psy);
  assert.notEqual(g.psychic, psy);
  assert.equal(g.phase, 'pick');
});

test('une équipe vidée : l’autre gagne par abandon', () => {
  const { room } = setup({ n: 4 });
  room.removePlayer('p1');
  room.removePlayer('p3');
  assert.equal(room.phase, 'ended');
  assert.equal(room.summary.reason, 'abandon');
  assert.deepEqual([...room.winnerIds].sort(), ['p0', 'p2']);
});
