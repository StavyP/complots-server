// traitres.test.js — Règles de Traîtres à bord (moteur seul, sans réseau).
// Lancer : node --test tests/traitres.test.js   (depuis server/)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TraitresRoom, TABLE } = require('../jeux/traitres.js');
const { fakeClock } = require('./aide');

let seq = 1000;
const B = (v) => ({ id: ++seq, kind: 'butin', v });
const A = (a) => ({ id: ++seq, kind: 'action', a });

/**
 * Partie à n joueurs, sièges p0..p(n-1) dans l'ordre, p0 commence.
 * `roles` : rôles imposés (sinon p(n-1) mutin, les autres pirates) ;
 * `hands` : mains imposées ; `deck` : cartes du dessus de la pioche (la
 * première piochée d'abord), le reste de la pioche est complété avec des 0.
 */
function setup({ n = 4, roles, hands = {}, deck = [], fill = 30, settings = null } = {}) {
  const clock = fakeClock();
  const room = new TraitresRoom('TEST', { clock });
  for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + (i + 1), 's' + i);
  if (settings) assert.equal(room.setSettings('p0', settings), null);
  assert.equal(room.start('p0'), null);
  room.clearTimer();
  const g = room.g;
  g.seats = Array.from({ length: n }, (_, i) => 'p' + i);
  g.roles = Object.fromEntries(g.seats.map((id, i) => [id, roles?.[i] || (i === n - 1 ? 'mutin' : 'pirate')]));
  g.hands = Object.fromEntries(g.seats.map((id) => [id, hands[id] || [B(1), B(0), B(-2)]]));
  g.deck = [...Array.from({ length: fill }, () => B(0)), ...[...deck].reverse()];
  g.coffre = [];
  g.cur = 'p0';
  g.step = 'turn';
  return { room, clock, g };
}
const hand = (room, id) => room.g.hands[id];

test('table officielle : mutins, planches et objectif selon le nombre de joueurs', () => {
  assert.deepEqual(TABLE[3], [1, 6, 5]);
  assert.deepEqual(TABLE[5], [1, 10, 11]);
  assert.deepEqual(TABLE[6], [2, 14, 6]);
  assert.deepEqual(TABLE[8], [2, 22, 12]);
  for (let n = 3; n <= 8; n++) {
    const room = new TraitresRoom('T', { clock: fakeClock() });
    for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
    room.start('p0');
    const g = room.g;
    const [mutins, planches, cible] = TABLE[n];
    assert.equal(Object.values(g.roles).filter((r) => r === 'mutin').length, mutins);
    assert.equal(g.cible, cible);
    const all = [...g.deck, ...Object.values(g.hands).flat()];
    assert.equal(all.length, 42 + planches + 12);
    assert.equal(all.filter((c) => c.a === 'planche').length, planches);
    assert.equal(all.filter((c) => c.v === 1).length, 20);
    assert.equal(all.filter((c) => c.v === -2).length, 12);
    assert.ok(Object.values(g.hands).every((h) => h.length === 3));
  }
  const room = new TraitresRoom('T', { clock: fakeClock() });
  room.addPlayer('a', 'A', 's'); room.addPlayer('b', 'B', 't');
  assert.match(room.start('a'), /au moins 3/);
});

test('chacun ne connaît que son rôle', () => {
  const { room } = setup({ n: 4 });
  const v = room.viewFor('p0').game;
  assert.equal(v.seats.find((s) => s.id === 'p0').role, 'pirate');
  assert.ok(v.seats.filter((s) => s.id !== 'p0').every((s) => s.role === null));
  assert.equal(v.me.hand.length, 3);
});

test('Butin : face cachée dans le coffre, valeur annoncée (mensonge permis), puis on pioche', () => {
  const b = B(-2);
  const { room, g } = setup({ hands: { p0: [b, B(0), A('planche')] }, deck: [B(1)] });
  assert.equal(room.actPlay('p0', { card: b.id, ann: 1 }), true);
  assert.equal(g.coffre.length, 1);
  assert.equal(g.coffre[0].v, -2, 'vraie valeur');
  assert.deepEqual(g.annonces.map((a) => a.ann), [1], 'annonce mensongère enregistrée');
  assert.equal(hand(room, 'p0').length, 3, 'on repioche');
  assert.equal(g.cur, 'p1');
  assert.equal(room.actPlay('p0', { card: hand(room, 'p0')[0].id }), false, 'plus son tour');
  const v = room.viewFor('p1').game;
  assert.equal(v.coffre, 1);
  assert.equal(v.coffreFin, null, 'le contenu reste secret');
});

test('annonce invalide refusée', () => {
  const b = B(1);
  const { room } = setup({ hands: { p0: [b, B(0), B(0)] } });
  assert.equal(room.actPlay('p0', { card: b.id, ann: 5 }), false);
});

test('Planche : jamais sur soi ; à 3, poussé à l’eau (rôle révélé, main défaussée)', () => {
  const pl = () => A('planche');
  const { room, g } = setup({ n: 5, roles: ['pirate', 'pirate', 'pirate', 'pirate', 'mutin'], hands: { p0: [pl(), pl(), pl()], p1: [pl(), pl(), pl()], p2: [pl(), B(0), B(0)] } });
  const c0 = hand(room, 'p0')[0];
  assert.equal(room.actPlay('p0', { card: c0.id, target: 'p0' }), false);
  assert.equal(room.actPlay('p0', { card: c0.id }), false, 'cible obligatoire');
  assert.equal(room.actPlay('p0', { card: c0.id, target: 'p3' }), true);
  room.actPlay('p1', { card: hand(room, 'p1')[0].id, target: 'p3' });
  assert.equal(g.planches.p3, 2);
  room.actPlay('p2', { card: hand(room, 'p2')[0].id, target: 'p3' });
  assert.equal(g.out.p3, true);
  assert.equal(g.hands.p3.length, 0);
  assert.equal(room.viewFor('p0').game.seats.find((s) => s.id === 'p3').role, 'pirate', 'rôle révélé à tous');
  assert.equal(g.cur, 'p4', 'le joueur à l’eau est sauté');
  assert.equal(room.phase, 'play');
});

test('pirates gagnent quand tous les mutins sont à l’eau', () => {
  const { room, g } = setup({ n: 4 });
  g.planches.p3 = 2;
  g.hands.p0 = [A('planche'), B(0), B(0)];
  room.actPlay('p0', { card: g.hands.p0[0].id, target: 'p3' });
  assert.equal(room.phase, 'ended');
  assert.equal(room.summary.camp, 'pirates');
  assert.deepEqual([...room.winnerIds].sort(), ['p0', 'p1', 'p2']);
});

test('mutins gagnent quand ils sont aussi nombreux que les pirates à bord', () => {
  const { room, g } = setup({ n: 4 });
  g.out.p1 = true;
  g.planches.p2 = 2;
  g.hands.p0 = [A('planche'), B(0), B(0)];
  room.actPlay('p0', { card: g.hands.p0[0].id, target: 'p2' });
  assert.equal(room.phase, 'ended');
  assert.equal(room.summary.camp, 'mutins');
  assert.deepEqual(room.winnerIds, ['p3']);
});

test('ouvrir le coffre : seulement un pirate, au début de son tour ; total ≥ cible → pirates', () => {
  const { room, g } = setup({ n: 4 });
  g.coffre = [B(1), B(1), B(1), B(1), B(1), B(1), B(1), B(1)];
  g.cur = 'p3';
  assert.equal(room.actOpen('p3'), false, 'un mutin ne peut pas');
  g.cur = 'p0';
  assert.equal(room.viewFor('p0').game.me.canOpen, true);
  assert.equal(room.actOpen('p0'), true);
  assert.equal(room.summary.camp, 'pirates');
  assert.equal(room.summary.total, 8);
  assert.ok(room.viewFor('p1').game.coffreFin.length === 8, 'le coffre est retourné');
});

test('ouvrir trop tôt : total < cible → mutins', () => {
  const { room, g } = setup({ n: 4 });
  g.coffre = [B(1), B(-2), B(1)];
  room.actOpen('p0');
  assert.equal(room.summary.camp, 'mutins');
});

test('on ne peut plus ouvrir après avoir joué une carte ce tour-ci', () => {
  const { room, g } = setup({ n: 4, hands: { p0: [A('longvue'), B(0), B(0)] } });
  g.coffre = [B(1), B(1)];
  room.actPlay('p0', { card: hand(room, 'p0')[0].id });
  assert.equal(g.step, 'longvue');
  assert.equal(room.actOpen('p0'), false);
});

test('Longue-vue : regarder les 3 du dessus en secret et les replacer dans l’ordre choisi', () => {
  const [x, y, z, w] = [B(1), B(0), B(-2), B(1)];
  const { room, g } = setup({ n: 4, hands: { p0: [A('longvue'), B(0), B(0)] } });
  g.coffre = [w, x, y, z]; // z sur le dessus
  room.actPlay('p0', { card: hand(room, 'p0')[0].id });
  assert.equal(g.coffre.length, 1);
  const mine = room.viewFor('p0').game.ctx;
  assert.equal(mine.cards.length, 3);
  assert.ok(mine.cards.every((c) => c.by === undefined), 'on ne sait pas qui a posé quoi');
  assert.equal(room.viewFor('p1').game.ctx.secret, true, 'les autres ne voient rien');
  assert.equal(room.actLongvue('p0', { order: [x.id, y.id] }), false, 'il faut toutes les cartes');
  assert.equal(room.actLongvue('p0', { order: [x.id, z.id, y.id] }), true);
  assert.deepEqual(g.coffre.map((c) => c.id), [w.id, y.id, z.id, x.id], 'x au-dessus');
  assert.equal(g.cur, 'p1');
});

test('Bon débarras : les 2 du dessus du coffre partent à la défausse sans être vues', () => {
  const { room, g } = setup({ n: 4, hands: { p0: [A('debarras'), B(0), B(0)] } });
  const [a, b, c] = [B(1), B(1), B(-2)];
  g.coffre = [a, b, c];
  const d0 = g.defausse;
  room.actPlay('p0', { card: hand(room, 'p0')[0].id });
  assert.deepEqual(g.coffre.map((k) => k.id), [a.id]);
  assert.equal(g.defausse, d0 + 1 + 2);
});

test('Vide tes poches : la cible défausse toute sa main et pioche 3', () => {
  const { room, g } = setup({ n: 4, hands: { p0: [A('vide'), B(0), B(0)], p2: [A('planche'), A('planche')] }, deck: [B(1), B(1), B(1), B(-2)] });
  room.actPlay('p0', { card: hand(room, 'p0')[0].id, target: 'p2' });
  assert.equal(hand(room, 'p2').length, 3);
  assert.ok(hand(room, 'p2').every((c) => c.v === 1), 'les 3 cartes du dessus');
  assert.equal(hand(room, 'p0').length, 3, 'le joueur actif repioche');
  assert.equal(hand(room, 'p0')[2].v, -2);
});

test('Pêche miraculeuse : piocher 3, en remettre 2 dans l’ordre choisi, ne pas repiocher', () => {
  const [d1, d2, d3] = [B(1), B(-2), B(0)];
  const { room, g } = setup({ n: 4, hands: { p0: [A('peche'), B(1), B(1)] }, deck: [d1, d2, d3] });
  room.actPlay('p0', { card: hand(room, 'p0')[0].id });
  assert.equal(g.step, 'peche');
  assert.equal(hand(room, 'p0').length, 5);
  assert.equal(room.actPeche('p0', { back: [d2.id] }), false, 'il faut en remettre 2');
  assert.equal(room.actPeche('p0', { back: [d2.id, d3.id] }), true);
  assert.equal(hand(room, 'p0').length, 3, 'pas de pioche en fin de tour');
  assert.equal(g.deck.at(-1).id, d2.id, 'd2 sur le dessus');
  assert.equal(g.deck.at(-2).id, d3.id);
  assert.equal(g.cur, 'p1');
});

test('pioche vide : les mutins gagnent aussitôt', () => {
  const { room, g } = setup({ n: 4, fill: 0, deck: [B(1)] });
  room.actPlay('p0', { card: hand(room, 'p0')[0].id, ann: 1 });
  assert.equal(room.phase, 'ended');
  assert.equal(room.summary.camp, 'mutins');
  assert.match(room.summary.reason, /pioche est vide/);
});

test('à la fin, le coffre est retourné : vraies valeurs, annonces et auteurs', () => {
  const b = B(-2);
  const { room, g } = setup({ n: 4, hands: { p0: [b, B(0), B(0)] } });
  room.actPlay('p0', { card: b.id, ann: 1 });
  g.cur = 'p1';
  room.actOpen('p1');
  const fin = room.viewFor('p2').game.coffreFin;
  assert.deepEqual(fin, [{ v: -2, ann: 1, by: 'p0' }]);
});

test('joueur absent : son coup est joué d’office au bout de 30 s', () => {
  const { room, clock, g } = setup({ n: 4 });
  room.armTimer();
  room.disconnect('p0', 's0');
  clock.advance(29000);
  assert.equal(g.cur, 'p0');
  clock.advance(1500);
  assert.equal(g.cur, 'p1');
  assert.equal(g.annonces[0].ann, g.coffre[0].v, 'annonce honnête');
});

test('minuterie de tour réglable', () => {
  const { room, clock, g } = setup({ n: 4, settings: { tour: 45 } });
  room.armTimer();
  clock.advance(44000);
  assert.equal(g.cur, 'p0');
  clock.advance(2000);
  assert.equal(g.cur, 'p1');
});

test('quitter la partie = passer par-dessus bord (et le tour passe)', () => {
  const { room, g } = setup({ n: 6, roles: ['pirate', 'pirate', 'pirate', 'pirate', 'mutin', 'mutin'] });
  room.removePlayer('p0');
  assert.equal(g.out.p0, true);
  assert.equal(g.cur, 'p1');
  assert.equal(room.phase, 'play', '3 pirates contre 2 mutins');
  room.removePlayer('p1');
  assert.equal(room.phase, 'ended', '2 mutins contre 2 pirates');
  assert.equal(room.summary.camp, 'mutins');
});
