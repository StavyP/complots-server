// 7wonders-fuzz.test.js — Parties aléatoires de 7 Wonders (édition 2020).
// Vérifie : pas de blocage, 7 cartes par joueur et par âge toutes
// retrouvées (cité, sous la Merveille, défausse), pièces jamais négatives,
// jamais deux bâtiments identiques, fin cohérente.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SevenRoom } = require('../jeux/7wonders.js');
const { fakeClock } = require('./aide');

const PARTIES = 150;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

test(`${PARTIES} parties aléatoires (3 à 7 joueurs, faces A et B)`, () => {
  for (let partie = 0; partie < PARTIES; partie++) {
    const clock = fakeClock();
    const room = new SevenRoom('F', { clock });
    const n = 3 + (partie % 5);
    for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
    room.setSettings('p0', { faces: pick(['hasard', 'A', 'B', 'choix']), tour: 0 });
    assert.equal(room.start('p0'), null);
    let steps = 0;
    while (room.phase === 'play') {
      assert.ok(++steps < 6000, `partie ${partie} bloquée (${room.g.phase})`);
      const g = room.g;
      for (const s of g.seats) {
        assert.ok(s.coins >= 0, 'pièces négatives');
        assert.equal(new Set(s.built).size, s.built.length, 'bâtiment en double');
      }
      // Toutes les cartes de l'âge en cours sont quelque part.
      if (g.phase === 'play' || g.phase === 'special') {
        const enJeu = g.seats.reduce((t, s) => t + s.built.length + s.under + s.hand.length, 0) + g.discard.length;
        assert.equal(enJeu, 7 * n * g.age, `partie ${partie} : cartes perdues (âge ${g.age}, tour ${g.turn})`);
      }
      const r = Math.random();
      const live = room.players.filter((p) => !p.left);
      if (r < 0.002 && live.length > 2) { room.removePlayer(pick(live).id); continue; }
      if (r < 0.01) {
        const p = pick(live);
        if (p.connected) room.disconnect(p.id, p.socketId); else room.reconnect(p.id, p.socketId);
        continue;
      }
      const waiting = room.waitingOn().filter((id) => room.player(id)?.connected);
      if (!waiting.length) { clock.advance(31000); continue; }
      const pid = pick(waiting);
      const s = room.seat(pid);
      if (g.phase === 'sides') { room.actSide(pid, { side: pick(['A', 'B']) }); continue; }
      if (g.phase === 'special') {
        const opts = room.gameView(pid).special.options;
        room.actDiscardPick(pid, { card: Math.random() < 0.8 ? pick(opts) : null });
        continue;
      }
      // Choisir un coup possible : construire, Merveille, gratuit, sinon défausser.
      const me = room.gameView(pid).me;
      const moves = [];
      me.hand.forEach((c) => {
        moves.push({ type: 'discard', card: c.name });
        if (c.build) moves.push({ type: 'build', card: c.name }, { type: 'build', card: c.name });
        if (c.free) moves.push({ type: 'free', card: c.name });
      });
      if (me.wonder) me.hand.forEach((c) => moves.push({ type: 'wonder', card: c.name }));
      assert.equal(room.actMove(pid, pick(moves)), true, `coup refusé (${g.phase})`);
      void s;
    }
    assert.equal(room.phase, 'ended');
    const g = room.g;
    const enJeu = g.seats.reduce((t, s) => t + s.built.length + s.under + s.hand.length, 0) + g.discard.length;
    assert.equal(enJeu, 21 * n, `partie ${partie} : cartes perdues à la fin`);
    if (room.summary.reason === 'score') {
      const humans = g.seats.filter((s) => !room.isBot(s));
      const best = Math.max(...humans.map((s) => g.score[s.id].total));
      assert.ok(room.winnerIds.every((id) => g.score[id].total === best));
      assert.equal(g.age, 3);
    }
  }
});
