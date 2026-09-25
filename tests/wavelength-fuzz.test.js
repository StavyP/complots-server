// wavelength-fuzz.test.js — Parties aléatoires de Wavelength jusqu'au bout.
// Vérifie : pas de blocage, scores cohérents, cible jamais montrée avant la
// révélation à quelqu'un d'autre que le médium.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WavelengthRoom } = require('../jeux/wavelength.js');
const { fakeClock } = require('./aide');

const PARTIES = 400;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

test(`${PARTIES} parties aléatoires (2 à 12 joueurs, équipes et coopératif)`, () => {
  for (let partie = 0; partie < PARTIES; partie++) {
    const clock = fakeClock();
    const room = new WavelengthRoom('F', { clock });
    const n = 2 + (partie % 11);
    for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
    room.setSettings('p0', { mode: pick(['auto', 'auto', 'coop']), cible: pick([7, 10]) });
    assert.equal(room.start('p0'), null, `partie ${partie}`);
    let steps = 0;
    while (room.phase === 'play') {
      assert.ok(++steps < 4000, `partie ${partie} bloquée (${room.g.phase})`);
      const g = room.g;
      // La cible n'est visible que du médium avant la révélation.
      if (g.phase !== 'reveal') {
        for (const p of room.players) if (p.id !== g.psychic) assert.equal(room.gameView(p.id).target, null);
      }
      const live = room.players.filter((p) => !p.left);
      const r = Math.random();
      if (r < 0.004 && live.length > 2) { room.removePlayer(pick(live).id); continue; }
      if (r < 0.02) {
        const p = pick(live);
        if (p.connected) room.disconnect(p.id, p.socketId); else room.reconnect(p.id, p.socketId);
        continue;
      }
      const on = (id) => room.player(id)?.connected;
      if (g.phase === 'pick') {
        if (on(g.psychic)) room.actPick(g.psychic, { index: pick([0, 1]) }); else clock.advance(31000);
      } else if (g.phase === 'clue') {
        if (on(g.psychic)) room.actClue(g.psychic, { clue: 'indice ' + steps }); else clock.advance(31000);
      } else if (g.phase === 'guess') {
        const gs = room.guessers().filter(on);
        if (!gs.length) { clock.advance(31000); continue; }
        const who = pick(gs);
        if (Math.random() < 0.7) room.actDial(who, { value: Math.random() * 110 - 5 });
        else room.actLock(who);
      } else if (g.phase === 'lr') {
        const os = room.opponents().filter(on);
        if (!os.length) { clock.advance(31000); continue; }
        const who = pick(os);
        if (!g.lr || Math.random() < 0.5) room.actLR(who, { side: pick(['left', 'right']) });
        else room.actLRLock(who);
      } else if (g.phase === 'reveal') {
        room.actNext(pick(live).id);
      }
    }
    assert.equal(room.phase, 'ended');
    const g = room.g;
    if (room.summary.reason === 'score') {
      const [a, b] = g.scores;
      assert.notEqual(a, b);
      assert.ok(Math.max(a, b) >= g.cible);
      assert.equal(room.summary.team, a > b ? 0 : 1);
    }
    if (room.summary.reason === 'coop') {
      assert.equal(g.coop.played, g.coop.total);
      assert.ok(g.coop.score <= 3 * g.coop.total);
    }
  }
});
