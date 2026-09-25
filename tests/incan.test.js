// incan.test.js — Règles d'Incan Gold (moteur seul, sans réseau).
// Lancer : node --test tests/incan.test.js   (depuis server/)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { IncanRoom, TRESORS } = require('../jeux/incan.js');
const { fakeClock } = require('./aide');

const T = (v) => ({ kind: 'tresor', value: v });
const D = (t) => ({ kind: 'danger', type: t });
const R = (id, name = 'Relique ' + id) => ({ kind: 'relique', id, name });

/**
 * Partie à n joueurs (p0..), puis manche remise à zéro : chemin vide, tout le
 * monde dans le temple, et `deck` = prochaines cartes (la première d'abord).
 * La première carte est révélée comme dans le jeu (sans choix).
 */
function setup({ n = 3, deck = [], settings = null } = {}) {
  const clock = fakeClock();
  const room = new IncanRoom('TEST', { clock });
  for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + (i + 1), 's' + i);
  if (settings) assert.equal(room.setSettings('p0', settings), null);
  assert.equal(room.start('p0'), null);
  const g = room.g;
  room.clearTimer();
  // Oublier ce qu'a pu faire le tirage aléatoire du départ.
  g.path = [];
  g.seen = {};
  g.retires = [];
  g.explorers.forEach((e) => { e.gems = 0; e.inside = true; e.choice = null; e.startTent = e.tent; });
  g.deck = [...deck].reverse();
  g.step = 'draw';
  if (deck.length) {
    room.draw();
    if (g.step !== 'roundEnd') room.openChoices();
  }
  return { room, clock, g };
}

const choose = (room, map) => Object.entries(map).forEach(([id, c]) => assert.equal(room.actChoose(id, { choice: c }), true, `${id} ${c}`));
const ex = (room, id) => room.g.explorers.find((e) => e.id === id);

test('paquet de la 1re manche : 15 trésors, 15 dangers (3 de chaque), 1 relique', () => {
  const room = new IncanRoom('T', { clock: fakeClock() });
  ['a', 'b', 'c'].forEach((x, i) => room.addPlayer(x, x, 's' + i));
  room.start('a');
  const all = [...room.g.path, ...room.g.deck];
  assert.equal(all.filter((c) => c.kind === 'tresor').length, 15);
  assert.deepEqual(all.filter((c) => c.kind === 'tresor').map((c) => c.value).sort((a, b) => a - b), [...TRESORS].sort((a, b) => a - b));
  assert.equal(all.filter((c) => c.kind === 'danger').length, 15);
  for (const t of ['serpent', 'araignee', 'momie', 'feu', 'eboulement']) assert.equal(all.filter((c) => c.type === t).length, 3);
  assert.equal(all.filter((c) => c.kind === 'relique').length, 1);
});

test('la 1re carte est révélée sans choix ; si c’est un danger, on en révèle une autre', () => {
  const { g } = setup({ deck: [D('feu'), T(7), T(3)] });
  assert.equal(g.path.length, 1, 'une seule carte avant le premier choix (setup)');
  const clock = fakeClock();
  const room = new IncanRoom('X', { clock });
  ['a', 'b'].forEach((x, i) => room.addPlayer(x, x, 's' + i));
  room.start('a');
  if (room.g.path[0].kind === 'danger') assert.ok(room.g.path.length >= 2);
  else assert.equal(room.g.path.length, 1);
  assert.equal(room.g.step, room.g.step === 'roundEnd' ? 'roundEnd' : 'decide');
});

test('trésor partagé entre ceux du temple, arrondi à l’inférieur, le reste reste sur la carte', () => {
  const { room, g } = setup({ n: 3, deck: [T(17), T(5)] });
  assert.deepEqual(g.explorers.map((e) => e.gems), [5, 5, 5]);
  assert.equal(g.path[0].left, 2);
  choose(room, { p0: 'go', p1: 'go', p2: 'go' });
  assert.equal(g.step, 'reveal');
  room.clock.advance(2000);
  assert.deepEqual(g.explorers.map((e) => e.gems), [6, 6, 6]);
  assert.equal(g.path[1].left, 2);
});

test('les choix sont secrets jusqu’à ce que tout le monde ait choisi', () => {
  const { room } = setup({ n: 3, deck: [T(9), T(4)] });
  room.actChoose('p0', { choice: 'camp' });
  const v1 = room.viewFor('p1').game.explorers.find((e) => e.id === 'p0');
  assert.equal(v1.decided, true);
  assert.equal(v1.choice, null, 'on sait qu’il a choisi, pas quoi');
  assert.equal(room.viewFor('p0').game.explorers.find((e) => e.id === 'p0').choice, 'camp');
  assert.equal(room.g.step, 'decide');
  assert.equal(room.actUndo('p0'), true, 'on peut changer d’avis');
  assert.equal(ex(room, 'p0').choice, null);
});

test('rentrer : partage des gemmes du chemin, le reste reste ; les gemmes vont dans la tente', () => {
  // 3 joueurs : 17 → 5 chacun, 2 restent ; 11 → 3 chacun, 2 restent. Chemin : 4.
  const { room, g, clock } = setup({ n: 3, deck: [T(17), T(11), T(1)] });
  choose(room, { p0: 'go', p1: 'go', p2: 'go' });
  clock.advance(2000);
  assert.equal(g.path.reduce((t, c) => t + (c.left || 0), 0), 4);
  // p0 et p1 rentrent ensemble : 4 / 2 = 2 chacun.
  choose(room, { p0: 'camp', p1: 'camp', p2: 'go' });
  assert.equal(ex(room, 'p0').tent, 5 + 3 + 2);
  assert.equal(ex(room, 'p1').tent, 10);
  assert.equal(ex(room, 'p0').inside, false);
  assert.equal(g.path.reduce((t, c) => t + (c.left || 0), 0), 0);
  // p2 continue seul : le 1 est entièrement pour lui.
  clock.advance(2000);
  assert.equal(ex(room, 'p2').gems, 5 + 3 + 1);
});

test('reste impair : partagé, le surplus reste sur le chemin', () => {
  const { room, g } = setup({ n: 2, deck: [T(5)] });
  // 5 / 2 = 2 chacun, 1 reste ; les deux rentrent : 1 / 2 = 0, 1 reste.
  choose(room, { p0: 'camp', p1: 'camp' });
  assert.equal(ex(room, 'p0').tent, 2);
  assert.equal(ex(room, 'p1').tent, 2);
  assert.equal(g.step, 'roundEnd');
});

test('relique : seul un joueur qui rentre SEUL l’emporte ; 3 premières = 5, suivantes = 10', () => {
  const { room, g, clock } = setup({ n: 3, deck: [R('r1'), T(3), R('r2'), T(2)] });
  choose(room, { p0: 'camp', p1: 'go', p2: 'go' });
  assert.equal(ex(room, 'p0').reliques.length, 1);
  assert.equal(ex(room, 'p0').reliques[0].value, 5);
  clock.advance(2000); // T(3)
  choose(room, { p1: 'go', p2: 'go' });
  clock.advance(2000); // R2
  choose(room, { p1: 'camp', p2: 'camp' });
  assert.equal(ex(room, 'p1').reliques.length, 0, 'deux rentrent ensemble : personne ne la prend');
  assert.equal(ex(room, 'p2').reliques.length, 0);
  assert.equal(g.step, 'roundEnd');
  assert.ok(g.roundInfo.perdues.length === 1, 'relique restée sur le chemin : perdue');
  assert.equal(room.valeurRelique ?? null, null);
  const { valeurRelique } = require('../jeux/incan.js');
  assert.deepEqual([0, 1, 2, 3, 4].map(valeurRelique), [5, 5, 5, 10, 10]);
});

test('danger en double : ceux du temple perdent leurs gemmes, la carte est retirée du jeu', () => {
  const { room, g, clock } = setup({ n: 3, deck: [T(9), D('serpent'), D('serpent')] });
  choose(room, { p0: 'camp', p1: 'go', p2: 'go' });
  assert.equal(ex(room, 'p0').tent, 3);
  clock.advance(2000); // 1er serpent
  assert.equal(g.step, 'decide');
  choose(room, { p1: 'go', p2: 'go' });
  clock.advance(2000); // 2e serpent
  assert.equal(g.step, 'roundEnd');
  assert.equal(ex(room, 'p1').tent, 0);
  assert.equal(ex(room, 'p2').tent, 0);
  assert.equal(ex(room, 'p0').tent, 3, 'celui qui est rentré garde tout');
  assert.deepEqual(g.retires, ['serpent']);
  // Manche suivante : 2 serpents seulement dans le paquet.
  room.actForce('p0');
  const all = [...g.path, ...g.deck];
  assert.equal(all.filter((c) => c.type === 'serpent').length, 2);
  assert.equal(g.round, 2);
});

test('reliques : une de plus par manche ; celles jamais sorties restent pour la suite', () => {
  const { room, g } = setup({ n: 2, deck: [T(4)] });
  // La relique de la manche 1 n'est pas sortie.
  choose(room, { p0: 'camp', p1: 'camp' });
  room.actForce('p0');
  const all = [...g.path, ...g.deck];
  assert.equal(all.filter((c) => c.kind === 'relique').length, 2, 'celle de la manche 1 + la nouvelle');
});

test('sans reliques (règle Diamant d’origine)', () => {
  const room = new IncanRoom('T', { clock: fakeClock() });
  ['a', 'b'].forEach((x, i) => room.addPlayer(x, x, 's' + i));
  room.setSettings('a', { reliques: false });
  room.start('a');
  assert.equal([...room.g.path, ...room.g.deck].filter((c) => c.kind === 'relique').length, 0);
});

test('tout le monde rentre : fin de manche ; 5 manches puis fin de partie', () => {
  const { room, g } = setup({ n: 2, deck: [T(10)] });
  choose(room, { p0: 'camp', p1: 'go' });
  g.deck.push(T(8));
  room.clock.advance(2000);
  choose(room, { p1: 'camp' });
  assert.equal(g.step, 'roundEnd');
  assert.equal(ex(room, 'p1').tent, 5 + 8);
  for (let r = 2; r <= 5; r++) {
    room.actReady('p0');
    room.actReady('p1');
    assert.equal(g.round, r);
    if (g.step === 'roundEnd') continue; // danger double dès l'entrée
    for (const e of room.inside()) room.actChoose(e.id, { choice: 'camp' });
  }
  assert.equal(room.phase, 'ended');
  assert.deepEqual(room.winnerIds, ['p1']);
});

test('fin de partie : égalité départagée par le nombre de reliques', () => {
  const { room, g } = setup({ n: 2, deck: [T(2)] });
  g.round = 5;
  ex(room, 'p0').tent = 10;
  ex(room, 'p0').startTent = 10;
  ex(room, 'p1').tent = 5;
  ex(room, 'p1').startTent = 5;
  ex(room, 'p1').reliques = [{ name: 'x', value: 5 }];
  choose(room, { p0: 'camp', p1: 'camp' });
  assert.equal(room.phase, 'ended');
  assert.deepEqual(room.winnerIds, ['p1'], '11 partout, p1 a une relique');
});

test('la tente des autres est secrète (sauf réglage), la sienne visible', () => {
  const { room } = setup({ n: 2, deck: [T(6)] });
  choose(room, { p0: 'camp', p1: 'go' });
  const v = room.viewFor('p1').game;
  assert.equal(v.explorers.find((e) => e.id === 'p0').tent, null);
  assert.equal(room.viewFor('p0').game.explorers.find((e) => e.id === 'p0').tent, 3);
  const r2 = setup({ n: 2, deck: [T(6)], settings: { choix: 40, reliques: true, coffres: true } }).room;
  choose(r2, { p0: 'camp', p1: 'go' });
  assert.equal(r2.viewFor('p1').game.explorers.find((e) => e.id === 'p0').tent, 3);
});

test('absent : rentre au camp tout seul au bout de 15 s (il garde ses gemmes)', () => {
  const { room, g, clock } = setup({ n: 3, deck: [T(9)], settings: { choix: 0, reliques: true, coffres: false } });
  room.actChoose('p0', { choice: 'go' });
  room.actChoose('p1', { choice: 'go' });
  room.disconnect('p2', 's2');
  clock.advance(14000);
  assert.equal(g.step, 'decide');
  clock.advance(1500);
  assert.equal(ex(room, 'p2').inside, false);
  assert.equal(ex(room, 'p2').tent, 3);
});

test('minuterie : un joueur présent qui n’a pas choisi continue', () => {
  const { room, g, clock } = setup({ n: 2, deck: [T(4), T(2)], settings: { choix: 20, reliques: true, coffres: false } });
  room.actChoose('p0', { choice: 'go' });
  clock.advance(20500);
  assert.equal(g.step, 'reveal');
  assert.deepEqual(g.reveal.stayers.sort(), ['p0', 'p1']);
});

test('départ en pleine partie : il sort du temple ; seul restant → il gagne', () => {
  const { room, g } = setup({ n: 3, deck: [T(9)] });
  room.actChoose('p0', { choice: 'go' });
  room.actChoose('p1', { choice: 'go' });
  room.removePlayer('p2');
  assert.equal(g.step, 'reveal', 'les deux autres avaient choisi : on avance');
  room.removePlayer('p1');
  assert.equal(room.phase, 'ended');
  assert.deepEqual(room.winnerIds, ['p0']);
});

test('discussion : messages courts, anti-inondation', () => {
  const { room, clock } = setup({ n: 2, deck: [T(3)] });
  assert.equal(room.chat('p0', { text: '  Salut   tout le monde ' }), true);
  assert.equal(room.chat('p0', { text: 'encore' }), false, 'trop rapide');
  clock.advance(700);
  assert.equal(room.chat('p0', 'ok'), true);
  assert.equal(room.chat('p1', { text: '   ' }), false);
  const v = room.viewFor('p1');
  assert.deepEqual(v.chat.map((m) => m.text), ['Salut tout le monde', 'ok']);
  assert.equal(v.chat[0].name, 'J1');
});
