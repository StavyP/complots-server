// traitres-fuzz.test.js — Parties aléatoires de Traîtres à bord jusqu'au bout.
// Vérifie : pas de blocage, nombre de cartes constant (pioche + mains +
// coffre + défausse + cartes en suspens), rôles et coffre jamais montrés
// avant l'heure, fin cohérente.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TraitresRoom, TABLE } = require('../jeux/traitres.js');
const { fakeClock } = require('./aide');

const PARTIES = 500;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function cartes(room) {
  const g = room.g;
  const mains = Object.values(g.hands).reduce((t, h) => t + h.length, 0);
  const suspens = g.ctx?.cards ? g.ctx.cards.length : 0;
  const planches = Object.entries(g.planches).reduce((t, [id, n]) => t + (g.out[id] ? 0 : n), 0);
  return g.deck.length + mains + g.coffre.length + g.defausse + suspens + planches;
}

test(`${PARTIES} parties aléatoires (3 à 8 joueurs)`, () => {
  const bilan = { pirates: 0, mutins: 0 };
  for (let partie = 0; partie < PARTIES; partie++) {
    const clock = fakeClock();
    const room = new TraitresRoom('F', { clock });
    const n = 3 + (partie % 6);
    for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
    assert.equal(room.start('p0'), null);
    const total = 42 + TABLE[n][1] + 12;
    let steps = 0;
    while (room.phase === 'play') {
      assert.ok(++steps < 3000, `partie ${partie} bloquée (${room.g.step})`);
      const g = room.g;
      assert.equal(cartes(room), total, `partie ${partie} : cartes perdues (${g.step})`);
      // Informations secrètes : un autre joueur ne voit ni rôle caché ni coffre.
      const spy = pick(g.seats);
      const v = room.gameView(spy);
      for (const s of v.seats) if (s.id !== spy && !s.out && g.opened?.by !== s.id) assert.equal(s.role, null);
      assert.equal(v.coffreFin, null);
      const live = room.players.filter((p) => !p.left);
      const r = Math.random();
      if (r < 0.003 && live.length > 1) { room.removePlayer(pick(live).id); continue; }
      if (r < 0.015) {
        const p = pick(live);
        if (p.connected) room.disconnect(p.id, p.socketId); else room.reconnect(p.id, p.socketId);
        continue;
      }
      const pid = g.cur;
      if (!room.player(pid).connected) { clock.advance(31000); continue; }
      if (g.step === 'longvue') {
        const ids = g.ctx.cards.map((c) => c.id).sort(() => Math.random() - 0.5);
        room.actLongvue(pid, { order: ids });
        continue;
      }
      if (g.step === 'peche') {
        const h = g.hands[pid].map((c) => c.id).sort(() => Math.random() - 0.5);
        room.actPeche(pid, { back: h.slice(0, Math.min(2, h.length)) });
        continue;
      }
      if (g.roles[pid] === 'pirate' && g.coffre.length > 6 && Math.random() < 0.08) { room.actOpen(pid); continue; }
      const hand = g.hands[pid];
      if (!hand.length) { clock.advance(31000); continue; }
      const c = pick(hand);
      const others = room.crew().filter((id) => id !== pid);
      room.actPlay(pid, { card: c.id, ann: pick([1, 0, -2]), target: pick(others) });
    }
    assert.equal(room.phase, 'ended');
    const g = room.g;
    bilan[room.summary.camp]++;
    const camp = room.summary.camp === 'pirates' ? 'pirate' : 'mutin';
    assert.ok(room.winnerIds.every((id) => g.roles[id] === camp));
  }
  assert.ok(bilan.pirates > 0 && bilan.mutins > 0, `les deux camps gagnent parfois (${JSON.stringify(bilan)})`);
});
