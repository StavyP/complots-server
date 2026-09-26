// duel-fuzz.test.js — Parties aléatoires de 7 Wonders Duel.
// Vérifie : pas de blocage, pièces jamais négatives, chaque carte d'un âge
// retrouvée (structure, cités, sous les Merveilles, défausse), au plus
// 7 Merveilles, pion dans [−9, 9], aucune carte cachée dévoilée dans les
// vues, fin cohérente (gagnant = meilleur score en victoire civile).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DuelRoom, CARTE } = require('../jeux/duel.js');
const { fakeClock } = require('./aide');

const PARTIES = 300;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

test(`${PARTIES} parties aléatoires`, () => {
  const raisons = {};
  for (let partie = 0; partie < PARTIES; partie++) {
    const clock = fakeClock();
    const room = new DuelRoom('F', { clock });
    room.addPlayer('a', 'A', 'sa');
    room.addPlayer('b', 'B', 'sb');
    room.setSettings('a', { merveilles: pick(['selection', 'decouverte']), tour: pick([0, 0, 60]) });
    assert.equal(room.start('a'), null);
    let steps = 0;
    let dejaVues = 0; // cartes des âges précédents (cités + sous Merveilles + défausse)
    let age = 0;
    while (room.phase === 'play') {
      assert.ok(++steps < 3000, `partie ${partie} bloquée (${room.g.etape})`);
      const g = room.g;
      for (const s of g.sieges) assert.ok(s.pieces >= 0, 'pièces négatives');
      assert.ok(Math.abs(g.pion) <= 9);
      const construites = g.sieges.reduce((t, s) => t + s.merveilles.filter((w) => w.construite).length, 0);
      assert.ok(construites <= 7, 'plus de 7 Merveilles');
      if (g.etape === 'jeu') {
        if (g.age !== age) {
          age = g.age;
          dejaVues = g.sieges.reduce((t, s) => t + s.cite.length + s.merveilles.filter((w) => w.construite).length, 0) + g.defausse.length;
        }
        const prises = g.cases.filter((k) => k.prise).length;
        const placees = g.sieges.reduce((t, s) => t + s.cite.length + s.merveilles.filter((w) => w.construite).length, 0) + g.defausse.length;
        assert.equal(placees - dejaVues, prises, `partie ${partie} : cartes perdues (âge ${g.age})`);
        // Secret : aucune carte cachée dans les vues.
        for (const pid of ['a', 'b']) {
          const v = room.gameView(pid);
          v.cases.forEach((k, i) => { if (!g.cases[i].visible || g.cases[i].prise) assert.equal(k.carte, null); });
        }
      }
      const r = Math.random();
      if (r < 0.0015) { room.removePlayer(pick(['a', 'b'])); continue; }
      if (r < 0.004) {
        const p = pick(room.players);
        if (p.connected) room.disconnect(p.id, p.socketId); else room.reconnect(p.id, p.socketId);
        continue;
      }
      if (r < 0.006) { clock.advance(61000); room.actForfait(pick(['a', 'b'])); continue; }
      const i = room.attendu();
      assert.ok(i >= 0, 'personne n’est attendu');
      const pid = g.sieges[i].id;
      const v = room.gameView(pid);
      if (g.etape === 'selection') { assert.equal(room.actSelection(pid, { merveille: pick(v.selection.offertes) }), true); continue; }
      if (g.etape === 'debut') { assert.equal(room.actPremier(pid, { moi: Math.random() < 0.5 }), true); continue; }
      if (g.decision) {
        const opts = g.decision.type === 'mausolee' ? v.defausse : v.decision.options;
        assert.ok(opts && opts.length, `décision ${g.decision.type} sans option`);
        assert.equal(room.actChoix(pid, { id: pick(opts) }), true);
        continue;
      }
      // Coups possibles : construire (souvent), Merveille, défausser.
      const coups = [];
      for (const [n, o] of Object.entries(v.options)) {
        coups.push({ n: +n, type: 'defausser' });
        if (o.construire.ok) coups.push({ n: +n, type: 'construire' }, { n: +n, type: 'construire' }, { n: +n, type: 'construire' });
        for (const w of v.merveillesPossibles) if (w.ok) coups.push({ n: +n, type: 'merveille', merveille: w.id });
      }
      assert.ok(coups.length, 'aucun coup possible');
      const c = pick(coups);
      assert.equal(room.actCoup(pid, c), true, JSON.stringify(c));
    }
    const g = room.g;
    assert.equal(g.etape, 'fin');
    raisons[g.fin.raison] = (raisons[g.fin.raison] || 0) + 1;
    if (g.fin.raison === 'civile') {
      const [s0, s1] = g.score;
      if (s0.total !== s1.total) assert.deepEqual(g.fin.gagnants, [s0.total > s1.total ? 0 : 1]);
      assert.equal(g.age, 3);
      assert.ok(g.cases.every((k) => k.prise));
    }
    assert.deepEqual(room.winnerIds, g.fin.gagnants.map((k) => g.sieges[k].id));
    assert.equal(room.timerInfo, null);
    // Aucune carte en double nulle part.
    const toutes = [...g.sieges.flatMap((s) => s.cite), ...g.defausse];
    assert.equal(new Set(toutes).size, toutes.length, 'carte en double');
    assert.ok(toutes.every((id) => CARTE[id]));
  }
  // Fins courantes : elles doivent apparaître. La suprématie scientifique est
  // trop rare au hasard (certaines séries de 300 n'en ont aucune, d'où un test
  // instable) : elle est couverte par un test déterministe de duel.test.js.
  assert.ok(raisons.civile && raisons.militaire, JSON.stringify(raisons));
});
