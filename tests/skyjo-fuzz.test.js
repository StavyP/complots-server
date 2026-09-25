// skyjo-fuzz.test.js — Parties aléatoires de Skyjo jusqu'au bout.
// Vérifie : pas de blocage, 150 cartes en permanence, aucune carte cachée
// dévoilée dans les vues, fin de partie cohérente.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SkyjoRoom } = require('../jeux/skyjo.js');
const { fakeClock } = require('./aide');

const PARTIES = 300;
const STATS = { manches: 0, etapes: 0 };
test.after(() => console.log('bilan du fuzz :', JSON.stringify(STATS)));

function cartes(room) {
  const g = room.g;
  const grids = g.seats.reduce((t, s) => t + s.grid.filter((c) => !c.gone).length, 0);
  return g.deck.length + g.discard.length + grids + (g.held !== null ? 1 : 0);
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function coupAleatoire(room) {
  const g = room.g;
  const pid = g.cur;
  const s = room.seat(pid);
  const cells = (f) => s.grid.map((c, k) => (f(c) ? k : -1)).filter((k) => k >= 0);
  if (g.step === 'choose') return Math.random() < 0.5 ? room.actDraw(pid) : room.actTake(pid);
  if (g.step === 'drawn') {
    if (Math.random() < 0.5 && cells((c) => !c.up && !c.gone).length) return room.actDiscard(pid);
    return room.actPlace(pid, { i: pick(cells((c) => !c.gone)) });
  }
  if (g.step === 'took') return room.actPlace(pid, { i: pick(cells((c) => !c.gone)) });
  if (g.step === 'flip') return room.actFlip(pid, { i: pick(cells((c) => !c.up && !c.gone)) });
  return false;
}

test(`${PARTIES} parties aléatoires (2 à 8 joueurs) vont au bout sans tricher ni perdre de carte`, () => {
  for (let partie = 0; partie < PARTIES; partie++) {
    const clock = fakeClock();
    const room = new SkyjoRoom('F', { clock });
    const n = 2 + (partie % 7);
    for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
    room.setSettings('p0', { cible: pick([50, 100, 200, 200]), tour: pick([0, 0, 30]) });
    assert.equal(room.start('p0'), null);
    let steps = 0;
    while (room.phase === 'play') {
      assert.ok(++steps < 20000, `partie ${partie} bloquée (étape ${room.g.step})`);
      const g = room.g;
      assert.equal(cartes(room), 150, `partie ${partie} : cartes perdues à l'étape ${g.step}`);
      // Incidents rares : déconnexion, retour, départ.
      const r = Math.random();
      const live = room.players.filter((p) => !p.left);
      if (r < 0.004 && live.length > 1) {
        room.removePlayer(pick(live).id);
        continue;
      }
      if (r < 0.02) {
        const p = pick(live);
        if (p.connected) room.disconnect(p.id, p.socketId);
        else room.reconnect(p.id, p.socketId);
        continue;
      }
      if (g.step === 'reveal') {
        const s = pick(room.liveSeats().filter((x) => x.revealed < 2));
        if (s && room.player(s.id).connected) {
          const hidden = s.grid.map((c, k) => (!c.up ? k : -1)).filter((k) => k >= 0);
          room.actReveal(s.id, { i: pick(hidden) });
        } else clock.advance(21000);
        continue;
      }
      if (g.step === 'roundEnd') {
        for (const p of room.players.filter((x) => !x.left && x.connected)) room.actReady(p.id);
        if (room.g.step === 'roundEnd') room.actForce(room.hostId);
        continue;
      }
      if (!room.player(g.cur)?.connected || Math.random() < 0.01) {
        clock.advance(31000);
        continue;
      }
      coupAleatoire(room);
      // Les vues ne montrent jamais une carte cachée.
      if (Math.random() < 0.05) {
        const v = room.viewFor('p0').game;
        for (const s of v.seats) for (const c of s.grid) if (!c.up && !c.gone) assert.equal(c.v, null);
      }
    }
    STATS[room.summary?.reason] = (STATS[room.summary?.reason] || 0) + 1;
    STATS.manches += room.g.round;
    STATS.etapes += steps;
    assert.equal(room.phase, 'ended');
    assert.ok(Array.isArray(room.winnerIds));
    if (room.summary?.reason === 'score') {
      const live = room.liveSeats();
      const best = Math.min(...live.map((s) => s.total));
      assert.ok(room.winnerIds.every((id) => room.seat(id).total === best));
      assert.ok(live.some((s) => s.total >= room.settings.cible));
    }
  }
});
