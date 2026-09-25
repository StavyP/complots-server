// moteur.test.js — Tests des règles de Complots (moteur seul, sans réseau).
// Lancer : node --test tests/complots.test.js   (depuis server/)
//
// Chaque scénario reprend un exemple ou une règle des livrets officiels
// (Complots, Complots 2, Deluxe, Saint-Barthélemy, Tyrannie). Après chaque
// étape, deux invariants sont vérifiés : l'or total reste égal à 54, et le
// nombre total de cartes (mains + Cour) ne varie pas.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ComplotsRoom, TOTAL_GOLD } = require('../jeux/complots.js');

function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const h = ++seq; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout: (h) => timers.delete(h),
    advance(ms) {
      t += ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= t).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        due[1].fn();
      }
    },
  };
}

const ROSTERS = {
  c1: ['duchesse', 'assassin', 'comtesse', 'capitaine', 'ambassadeur'],
  c1inq: ['duchesse', 'assassin', 'comtesse', 'capitaine', 'inquisiteur'],
  cat: ['bourreau', 'espion', 'justicier', 'sorciere', 'ursuline'],
  expert: ['maitrechanteur', 'espion', 'pape', 'croquemort', 'illusionniste'],
  finances: ['maitrechanteur', 'espion', 'pape', 'sorciere', 'duchesse'],
};

/**
 * Partie de test déterministe : joueurs p0..p(n-1) assis dans l'ordre,
 * mains imposées (`hands[i]` = 2 personnages), p0 commence.
 */
function setup({ n = 3, edition = 'deluxe', roster = ROSTERS.c1, hands, coins, stbarth = false, tyrannie = false, religions } = {}) {
  const clock = fakeClock();
  const room = new ComplotsRoom('TEST', { clock });
  for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + (i + 1), 's' + i);
  const err = room.setSettings('p0', { edition, roster, stbarth, tyrannie, reactionTime: 10, preset: 'test' });
  assert.equal(err, null);
  assert.equal(room.start('p0'), null);
  room.players.sort((a, b) => a.id.localeCompare(b.id));
  const copies = n >= 7 ? 4 : 3;
  // Cour = toutes les cartes moins celles des mains imposées.
  const pool = roster.flatMap((c) => Array(copies).fill(c));
  room.players.forEach((p, i) => {
    const h = hands?.[i] || [roster[0], roster[1]];
    p.cards = h.map((char) => {
      pool.splice(pool.indexOf(char), 1);
      return { char, dead: false, hidden: false };
    });
    if (coins) p.coins = coins[i];
    if (religions) p.religion = religions[i];
  });
  room.court = pool;
  room.treasury = TOTAL_GOLD - room.players.reduce((s, p) => s + p.coins, 0);
  room.frames = [];
  room.clearTimer();
  room.startTurn('p0');
  room.settle();
  room.totalCards = copies * 5;
  return { room, clock };
}

function check(room) {
  const gold = room.players.reduce((s, p) => s + p.coins, 0) + room.treasury + room.hospice;
  assert.equal(gold, TOTAL_GOLD, `or total ${gold} ≠ 54`);
  if (room.totalCards) {
    const cards = room.players.reduce((s, p) => s + p.cards.length, 0) + room.court.length + room.inExchange.length;
    assert.equal(cards, room.totalCards, `cartes ${cards} ≠ ${room.totalCards}`);
  }
}

const P = (room, id) => room.player(id);
const prompt = (room, id) => room.viewFor(id).prompt;
function act(room, pid, action, target) {
  assert.ok(room.decide(pid, { action, target }), `action ${action} refusée pour ${pid}`);
  check(room);
}
function pass(room, pid) { assert.ok(room.respond(pid, { type: 'pass' }), `pass refusé pour ${pid}`); check(room); }
function challenge(room, pid) { assert.ok(room.respond(pid, { type: 'challenge' }), `doute refusé pour ${pid}`); check(room); }
function counter(room, pid, char) { assert.ok(room.respond(pid, { type: 'counter', char }), `contre ${char} refusé pour ${pid}`); check(room); }
function coclaim(room, pid) { assert.ok(room.respond(pid, { type: 'coclaim' }), `annonce refusée pour ${pid}`); check(room); }
function lose(room, pid, index = null, sorciere = false) {
  const pr = prompt(room, pid);
  assert.equal(pr?.kind, 'lose_life', `${pid} devrait choisir une carte à perdre (prompt=${pr?.kind})`);
  assert.ok(room.decide(pid, { index: index ?? pr.cards[0], sorciere }), 'perte refusée');
  check(room);
}
const aliveCount = (room, id) => P(room, id).cards.filter((c) => !c.dead).length;
const passAll = (room, ids) => ids.forEach((id) => pass(room, id));

// ── Actions de base ─────────────────────────────────────────────────────────
test('Revenu : +1, tour suivant, non contestable', () => {
  const { room } = setup();
  act(room, 'p0', 'income');
  assert.equal(P(room, 'p0').coins, 3);
  assert.equal(room.currentId, 'p1');
});

test('Aide étrangère contrée par la Duchesse (contre accepté)', () => {
  const { room } = setup();
  act(room, 'p0', 'foreign_aid');
  assert.deepEqual(prompt(room, 'p1').counters, ['duchesse']);
  assert.equal(prompt(room, 'p1').challenge, false, "l'Aide étrangère ne se conteste pas");
  counter(room, 'p1', 'duchesse');
  pass(room, 'p0');
  pass(room, 'p2');
  assert.equal(P(room, 'p0').coins, 2);
  assert.equal(room.currentId, 'p1');
});

test('Assassinat (7) obligatoire à 10 Or, non contrable', () => {
  const { room } = setup({ coins: [10, 2, 2] });
  assert.equal(room.decide('p0', { action: 'income' }), false);
  act(room, 'p0', 'coup', 'p1');
  lose(room, 'p1');
  assert.equal(P(room, 'p0').coins, 3);
  assert.equal(aliveCount(room, 'p1'), 1);
});

// ── Mise en doute ───────────────────────────────────────────────────────────
test('Doute raté : le douteur perd une vie, la carte prouvée est remplacée, le pouvoir s’applique', () => {
  const { room } = setup({ hands: [['duchesse', 'comtesse'], ['capitaine', 'assassin'], ['capitaine', 'assassin']] });
  act(room, 'p0', 'tax');
  challenge(room, 'p1');
  lose(room, 'p1');
  assert.equal(P(room, 'p0').coins, 5);
  assert.equal(aliveCount(room, 'p1'), 1);
  assert.equal(P(room, 'p0').cards.length, 2);
});

test('Bluff démasqué : l’Assassin ne paie pas ses 3 Or', () => {
  const { room } = setup({ coins: [3, 2, 2], hands: [['duchesse', 'comtesse'], ['capitaine', 'duchesse'], ['capitaine', 'duchesse']] });
  act(room, 'p0', 'assassinate', 'p1');
  challenge(room, 'p2');
  lose(room, 'p0');
  assert.equal(P(room, 'p0').coins, 3);
  assert.equal(aliveCount(room, 'p1'), 2);
  assert.equal(room.currentId, 'p1');
});

test('Exemple Deluxe 3 : doute raté puis contre de la cible (Ambassadeur), le joueur actif se couche', () => {
  const { room } = setup({ hands: [['capitaine', 'duchesse'], ['ambassadeur', 'duchesse'], ['comtesse', 'duchesse']] });
  act(room, 'p0', 'steal', 'p1');
  challenge(room, 'p2'); // Joueur 3 met en doute
  lose(room, 'p2');
  // Après le doute raté, la cible peut encore contrer.
  assert.ok(prompt(room, 'p1').counters.includes('ambassadeur'));
  counter(room, 'p1', 'ambassadeur');
  pass(room, 'p0'); // se couche
  pass(room, 'p2');
  assert.equal(P(room, 'p1').coins, 2, 'rien n’est volé');
});

test('Un contre peut être mis en doute par N’IMPORTE QUEL joueur', () => {
  const { room } = setup({ hands: [['capitaine', 'duchesse'], ['duchesse', 'duchesse'], ['comtesse', 'duchesse']] });
  act(room, 'p0', 'steal', 'p1');
  pass(room, 'p2');
  counter(room, 'p1', 'ambassadeur'); // bluff
  assert.equal(prompt(room, 'p2').challenge, true, 'un tiers peut douter du contre');
  challenge(room, 'p2');
  lose(room, 'p1');
  assert.equal(P(room, 'p0').coins, 4, 'le vol a lieu');
  assert.equal(P(room, 'p1').coins, 0);
});

test('Seule la cible peut contrer une action ciblée', () => {
  const { room } = setup({ coins: [3, 2, 2] });
  act(room, 'p0', 'assassinate', 'p1');
  assert.deepEqual(prompt(room, 'p2').counters, []);
  assert.deepEqual(prompt(room, 'p1').counters, ['comtesse']);
});

test('Comtesse : contre réussi, l’Assassin paie quand même 3 Or', () => {
  const { room } = setup({ coins: [3, 2, 2] });
  act(room, 'p0', 'assassinate', 'p1');
  counter(room, 'p1', 'comtesse');
  pass(room, 'p0');
  pass(room, 'p2');
  assert.equal(P(room, 'p0').coins, 0);
  assert.equal(aliveCount(room, 'p1'), 2);
});

test('Exemple 4 : douter de l’Assassin coûte 2 vies (éliminé), l’or retourne au Trésor', () => {
  const { room } = setup({ coins: [3, 4, 2], hands: [['assassin', 'duchesse'], ['duchesse', 'capitaine'], ['comtesse', 'duchesse']] });
  act(room, 'p0', 'assassinate', 'p1');
  challenge(room, 'p1');
  lose(room, 'p1'); // doute raté
  pass(room, 'p1'); // ne contre pas
  lose(room, 'p1'); // assassinat
  assert.equal(P(room, 'p1').eliminated, true);
  assert.equal(P(room, 'p1').coins, 0, "l'or du mort retourne au Trésor");
  assert.equal(room.currentId, 'p2');
});

// ── Complots 2 ──────────────────────────────────────────────────────────────
test('Exemple C2-5 : Bourreau contré par une Sorcière bluffée → doute, 2 vies, 3 Or pour la cible', () => {
  const { room } = setup({ roster: ROSTERS.cat, coins: [3, 0, 2], hands: [['bourreau', 'espion'], ['espion', 'justicier'], ['ursuline', 'espion']] });
  act(room, 'p0', 'executioner', 'p1');
  counter(room, 'p1', 'sorciere');
  challenge(room, 'p0');
  lose(room, 'p1'); // bluff démasqué
  lose(room, 'p1'); // exécution
  assert.equal(P(room, 'p1').eliminated, true);
  assert.equal(P(room, 'p0').coins, 0, 'le Bourreau a payé ses 3 Or');
});

test('Bourreau : contre qui tient → les 3 Or vont quand même à la cible', () => {
  const { room } = setup({ roster: ROSTERS.cat, coins: [3, 0, 2] });
  act(room, 'p0', 'executioner', 'p1');
  counter(room, 'p1', 'sorciere');
  pass(room, 'p0');
  pass(room, 'p2');
  assert.equal(P(room, 'p0').coins, 0);
  assert.equal(P(room, 'p1').coins, 3);
  assert.equal(aliveCount(room, 'p1'), 2);
});

test('Maître-Chanteur : la cible paie 3 Or… ou refuse, reçoit 3 Or et perd une vie', () => {
  const { room } = setup({ roster: ROSTERS.expert, coins: [3, 5, 2] });
  act(room, 'p0', 'blackmail', 'p1');
  pass(room, 'p1');
  pass(room, 'p2');
  assert.equal(prompt(room, 'p1').kind, 'blackmail');
  room.decide('p1', { pay: true });
  check(room);
  assert.equal(P(room, 'p0').coins, 6);
  assert.equal(P(room, 'p1').coins, 2);

  const r2 = setup({ roster: ROSTERS.expert, coins: [3, 5, 2] }).room;
  act(r2, 'p0', 'blackmail', 'p1');
  passAll(r2, ['p1', 'p2']);
  r2.decide('p1', { pay: false });
  lose(r2, 'p1');
  assert.equal(P(r2, 'p0').coins, 0);
  assert.equal(P(r2, 'p1').coins, 8);
  assert.equal(aliveCount(r2, 'p1'), 1);
});

test('Justicier : vole 3 au plus riche, en garde 1, donne 2 au plus pauvre', () => {
  const { room } = setup({ n: 4, roster: ROSTERS.cat, coins: [2, 6, 1, 3] });
  const opt = room.viewFor('p0').prompt.actions.find((a) => a.id === 'justice');
  assert.deepEqual(opt.targets, ['p1'], 'seul le plus riche est une cible');
  act(room, 'p0', 'justice', 'p1');
  passAll(room, ['p1', 'p2', 'p3']);
  assert.equal(P(room, 'p1').coins, 3);
  assert.equal(P(room, 'p0').coins, 3);
  assert.equal(P(room, 'p2').coins, 3, 'le plus pauvre reçoit 2');
});

test('Pape : prélève 1 à chacun, sauf à qui annonce aussi le Pape', () => {
  const { room } = setup({ n: 4, roster: ROSTERS.expert, hands: [['pape', 'espion'], ['pape', 'espion'], ['espion', 'croquemort'], ['espion', 'croquemort']] });
  act(room, 'p0', 'pope');
  counter(room, 'p1', 'pape'); // exemption
  passAll(room, ['p0', 'p2', 'p3']); // personne ne doute de p1
  passAll(room, ['p2', 'p3']); // action : personne ne doute du Pape de p0
  assert.equal(P(room, 'p0').coins, 4);
  assert.equal(P(room, 'p1').coins, 2, 'épargné');
  assert.equal(P(room, 'p2').coins, 1);
});

test('Illusionniste : +4, et 1 Or à chaque adversaire qui l’annonce aussi', () => {
  const { room } = setup({ roster: ROSTERS.expert, hands: [['illusionniste', 'espion'], ['illusionniste', 'espion'], ['espion', 'pape']] });
  act(room, 'p0', 'illusion');
  coclaim(room, 'p1');
  passAll(room, ['p0', 'p2']);
  pass(room, 'p2');
  assert.equal(P(room, 'p0').coins, 5);
  assert.equal(P(room, 'p1').coins, 3);
});

test('Sorcière : carte perdue annoncée → reste cachée, +5 Or ; bluff démasqué → 2e vie', () => {
  const { room } = setup({ roster: ROSTERS.cat, coins: [7, 2, 2], hands: [['espion', 'ursuline'], ['sorciere', 'espion'], ['espion', 'ursuline']] });
  act(room, 'p0', 'coup', 'p1');
  lose(room, 'p1', 0, true); // la Sorcière, annoncée
  const other = room.viewFor('p2').players.find((p) => p.id === 'p1').cards[0];
  assert.equal(other.char, null, 'la carte perdue reste cachée pour les autres');
  passAll(room, ['p0', 'p2']);
  assert.equal(P(room, 'p1').coins, 7);

  const r2 = setup({ roster: ROSTERS.cat, coins: [7, 2, 2], hands: [['espion', 'ursuline'], ['espion', 'justicier'], ['espion', 'ursuline']] }).room;
  act(r2, 'p0', 'coup', 'p1');
  lose(r2, 'p1', 0, true); // bluff
  challenge(r2, 'p2');
  lose(r2, 'p1'); // seconde vie
  assert.equal(P(r2, 'p1').eliminated, true);
  assert.equal(P(r2, 'p1').cards[0].hidden, false, 'la carte bluffée est dévoilée');
});

test('Croque-Mort : récupère l’or d’un joueur éliminé', () => {
  const { room } = setup({ roster: ROSTERS.expert, coins: [7, 3, 2], hands: [['espion', 'pape'], ['espion', 'pape'], ['croquemort', 'pape']] });
  P(room, 'p1').cards[0].dead = true; // déjà une vie perdue
  act(room, 'p0', 'coup', 'p1');
  lose(room, 'p1');
  assert.equal(P(room, 'p1').eliminated, true);
  coclaim(room, 'p2');
  passAll(room, ['p0']); // personne ne doute
  pass(room, 'p0');
  assert.equal(P(room, 'p2').coins, 5);
});

test('Inquisiteur : la cible montre une carte, l’Inquisiteur la fait défausser', () => {
  const { room } = setup({ roster: ROSTERS.c1inq, hands: [['inquisiteur', 'duchesse'], ['assassin', 'comtesse'], ['duchesse', 'duchesse']] });
  act(room, 'p0', 'inquire_look', 'p1');
  passAll(room, ['p1', 'p2']);
  assert.equal(prompt(room, 'p1').kind, 'show_card');
  room.decide('p1', { index: 1 });
  const pr = prompt(room, 'p0');
  assert.equal(pr.kind, 'inquisitor');
  assert.equal(pr.seen, 'comtesse');
  assert.equal(room.viewFor('p2').prompt, null, 'les autres ne voient pas la carte');
  room.decide('p0', { discard: true });
  check(room);
  assert.equal(room.currentId, 'p1');
});

test('Espion : pioche 1, échange, puis repioche en payant 1 Or', () => {
  const { room } = setup({ roster: ROSTERS.cat, hands: [['espion', 'bourreau'], ['ursuline', 'justicier'], ['ursuline', 'justicier']] });
  act(room, 'p0', 'spy_draw');
  passAll(room, ['p1', 'p2']);
  let pr = prompt(room, 'p0');
  assert.equal(pr.kind, 'exchange');
  assert.equal(pr.options.length, 3);
  assert.equal(pr.canRepeat, true);
  room.decide('p0', { keep: [0, 2], again: true });
  check(room);
  assert.equal(P(room, 'p0').coins, 1);
  pr = prompt(room, 'p0');
  assert.equal(pr.options.length, 3);
  room.decide('p0', { keep: [0, 1] });
  check(room);
  assert.equal(room.currentId, 'p1');
});

test('Ambassadeur : pioche 2, garde 2 parmi 4', () => {
  const { room } = setup({ hands: [['ambassadeur', 'duchesse'], ['comtesse', 'duchesse'], ['comtesse', 'duchesse']] });
  act(room, 'p0', 'ambassade');
  passAll(room, ['p1', 'p2']);
  const pr = prompt(room, 'p0');
  assert.equal(pr.options.length, 4);
  assert.equal(pr.keep, 2);
  room.decide('p0', { keep: [2, 3] });
  check(room);
});

// ── Saint-Barthélemy ────────────────────────────────────────────────────────
test('Saint-Barthélemy : pacte de non-agression, conversion, Hospice', () => {
  const { room } = setup({ n: 4, stbarth: true, coins: [3, 2, 2, 2], religions: ['catholique', 'protestant', 'catholique', 'protestant'] });
  const steal = room.viewFor('p0').prompt.actions.find((a) => a.id === 'steal');
  assert.deepEqual(steal.targets.sort(), ['p1', 'p3'], 'pas de vol entre catholiques');
  act(room, 'p0', 'convert_self');
  assert.equal(P(room, 'p0').religion, 'protestant');
  assert.equal(room.hospice, 1);
  // Aide étrangère de p1 : un coreligionnaire (p0, désormais protestant) ne peut pas la contrer.
  act(room, 'p1', 'foreign_aid');
  assert.equal(prompt(room, 'p0'), null);
  assert.deepEqual(prompt(room, 'p2').counters, ['duchesse']);
});

test('Abus de confiance mis en doute sans vie perdue : montre ses 2 cartes et en repioche 2', () => {
  const { room } = setup({ stbarth: true, religions: ['catholique', 'protestant', 'catholique'], hands: [['comtesse', 'capitaine'], ['duchesse', 'duchesse'], ['duchesse', 'assassin']] });
  room.hospice = 4;
  room.treasury -= 4;
  act(room, 'p0', 'embezzle');
  challenge(room, 'p1');
  lose(room, 'p1');
  assert.equal(P(room, 'p0').coins, 6);
  assert.equal(room.hospice, 0);
  check(room);
});

test('Réunification : plus de pacte ni de conversion', () => {
  const { room } = setup({ stbarth: true, religions: ['catholique', 'catholique', 'catholique'] });
  const opts = room.viewFor('p0').prompt.actions;
  assert.equal(opts.find((a) => a.id === 'convert_self').enabled, false);
  assert.deepEqual(opts.find((a) => a.id === 'steal').targets, ['p1', 'p2']);
});

// ── Tyrannie ────────────────────────────────────────────────────────────────
test('La Peste : Comtesse annoncée non contestée → transmise ; s’arrête à la première vie perdue', () => {
  const { room } = setup({ n: 4, tyrannie: true, coins: [5, 2, 2, 2], hands: [['duchesse', 'capitaine'], ['comtesse', 'duchesse'], ['duchesse', 'capitaine'], ['duchesse', 'capitaine']] });
  act(room, 'p0', 'peste', 'p1');
  room.decide('p1', { comtesse: true });
  passAll(room, ['p0', 'p2', 'p3']);
  const pr = prompt(room, 'p1');
  assert.equal(pr.kind, 'peste_pass');
  assert.deepEqual(pr.targets.sort(), ['p2', 'p3'], 'jamais au joueur actif');
  room.decide('p1', { target: 'p2' });
  room.decide('p2', { comtesse: false });
  lose(room, 'p2');
  assert.equal(room.currentId, 'p1', 'la Peste s’est arrêtée, tour suivant');
});

test('Le Mendiant : la cible passe son prochain tour', () => {
  const { room } = setup({ tyrannie: true });
  act(room, 'p0', 'mendiant', 'p1');
  assert.equal(room.currentId, 'p2', 'p1 est sauté');
  act(room, 'p2', 'income');
  assert.equal(room.currentId, 'p0');
});

// ── Divers ──────────────────────────────────────────────────────────────────
test('Minuterie : sans réponse, l’action se résout', () => {
  const { room, clock } = setup();
  act(room, 'p0', 'tax');
  clock.advance(11000);
  check(room);
  assert.equal(P(room, 'p0').coins, 5);
  assert.equal(room.currentId, 'p1');
});

test('Partie à 2 : 1 Or au premier joueur, choix d’une carte dans sa pile', () => {
  const clock = fakeClock();
  const room = new ComplotsRoom('DUO', { clock });
  room.addPlayer('a', 'A', 'sa');
  room.addPlayer('b', 'B', 'sb');
  assert.equal(room.start('a'), null);
  const first = room.players[0];
  assert.equal(first.coins, 1);
  assert.equal(room.court.length, 3);
  room.players.forEach((p) => room.decide(p.id, { char: 'assassin' }));
  assert.equal(room.players[0].cards.length, 2);
  assert.equal(prompt(room, room.players[0].id).kind, 'action');
  const gold = room.players.reduce((s, p) => s + p.coins, 0) + room.treasury;
  assert.equal(gold, TOTAL_GOLD);
});

test('Abandon pendant son tour : éliminé, le tour passe', () => {
  const { room } = setup();
  room.abandon('p0');
  check(room);
  assert.equal(P(room, 'p0').eliminated, true);
  assert.equal(room.currentId, 'p1');
});

test('Victoire : dernier survivant', () => {
  const { room } = setup({ n: 2, coins: [7, 2], hands: [['duchesse', 'comtesse'], ['duchesse', 'comtesse']] });
  P(room, 'p1').cards[0].dead = true;
  act(room, 'p0', 'coup', 'p1');
  lose(room, 'p1');
  assert.equal(room.phase, 'ended');
  assert.equal(room.winnerId, 'p0');
});
