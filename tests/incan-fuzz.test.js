// incan-fuzz.test.js — Parties aléatoires d'Incan Gold jusqu'au bout.
// Vérifie : pas de blocage, gemmes conservées (chemin + mains + tentes),
// reliques valant 5,5,5 puis 10, au plus un danger retiré par manche.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { IncanRoom } = require('../jeux/incan.js');
const { fakeClock } = require('./aide');

const PARTIES = 400;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function verifierGemmes(room, partie) {
  const g = room.g;
  if (!['decide', 'reveal'].includes(g.step)) return;
  const tires = g.path.reduce((t, c) => t + (c.kind === 'tresor' ? c.value : 0), 0);
  const surLeChemin = g.path.reduce((t, c) => t + (c.kind === 'tresor' ? c.left : 0), 0);
  const enMain = g.explorers.reduce((t, e) => t + e.gems, 0);
  const aLAbri = g.explorers.reduce((t, e) => t + (e.tent - e.startTent), 0);
  assert.equal(enMain + aLAbri + surLeChemin, tires, `partie ${partie} : gemmes perdues ou créées`);
}

test(`${PARTIES} parties aléatoires (2 à 8 joueurs) vont au bout, gemmes conservées`, () => {
  let manches = 0;
  for (let partie = 0; partie < PARTIES; partie++) {
    const clock = fakeClock();
    const room = new IncanRoom('F', { clock });
    const n = 2 + (partie % 7);
    for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
    room.setSettings('p0', { choix: pick([0, 20]), reliques: partie % 5 !== 0, coffres: false });
    assert.equal(room.start('p0'), null);
    let steps = 0;
    while (room.phase === 'play') {
      assert.ok(++steps < 5000, `partie ${partie} bloquée (${room.g.step})`);
      const g = room.g;
      verifierGemmes(room, partie);
      const r = Math.random();
      const live = room.players.filter((p) => !p.left);
      if (r < 0.003 && live.length > 1) { room.removePlayer(pick(live).id); continue; }
      if (r < 0.02) {
        const p = pick(live);
        if (p.connected) room.disconnect(p.id, p.socketId); else room.reconnect(p.id, p.socketId);
        continue;
      }
      if (g.step === 'decide') {
        const pending = room.inside().filter((e) => !e.choice && room.player(e.id).connected);
        if (!pending.length) { clock.advance(21000); continue; }
        const e = pick(pending);
        room.actChoose(e.id, { choice: Math.random() < 0.3 ? 'camp' : 'go' });
      } else if (g.step === 'reveal') {
        clock.advance(2000);
      } else if (g.step === 'roundEnd') {
        manches++;
        if (Math.random() < 0.5) clock.advance(26000);
        else for (const p of live) room.actReady(p.id);
      } else {
        assert.fail(`étape inattendue ${g.step}`);
      }
    }
    const g = room.g;
    assert.equal(room.phase, 'ended');
    const valeurs = g.explorers.flatMap((e) => e.reliques.map((x) => x.value)).sort((a, b) => a - b);
    assert.ok(valeurs.length <= 5);
    assert.deepEqual(valeurs, [5, 5, 5, 10, 10].slice(0, valeurs.length), `partie ${partie} : valeurs des reliques`);
    assert.ok(g.retires.length <= g.round, 'au plus un danger retiré par manche');
    if (room.summary?.reason === 'score') {
      const live = g.explorers.filter((e) => !room.player(e.id).left);
      const best = Math.max(...live.map((e) => room.score(e)));
      assert.ok(room.winnerIds.every((id) => room.score(room.ex(id)) === best));
      assert.equal(g.round, 5);
    }
  }
  assert.ok(manches > PARTIES, 'plusieurs manches par partie');
});
