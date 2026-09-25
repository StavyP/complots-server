// fuzz.test.js — Parties aléatoires complètes pour débusquer blocages et incohérences.
// Lancer : node --test tests/complots-fuzz.test.js   (FUZZ_GAMES=2000 pour plus)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ComplotsRoom, TOTAL_GOLD, CHARACTERS, CLANS, EDITIONS } = require('../jeux/complots.js');

function fakeClock() {
  let t = 0; let seq = 0; const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const h = ++seq; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout: (h) => timers.delete(h),
    advanceToNext() {
      const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
      if (!next) return false;
      t = next.at;
      for (const [h, v] of [...timers.entries()]) if (v.at <= t) { timers.delete(h); v.fn(); }
      return true;
    },
  };
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function randomSettings() {
  const edition = pick(Object.keys(EDITIONS));
  const roster = CLANS.map((clan) => pick(EDITIONS[edition].filter((c) => CHARACTERS[c].clan === clan)));
  return { edition, roster, stbarth: Math.random() < 0.4, tyrannie: Math.random() < 0.5, reactionTime: 10, preset: 'fuzz' };
}

function randomMove(room, pid, pr) {
  switch (pr.kind) {
    case 'action': {
      const opts = pr.actions.filter((a) => a.enabled);
      const o = pick(opts);
      return room.decide(pid, { action: o.id, target: o.targets ? pick(o.targets) : undefined });
    }
    case 'respond': {
      const moves = [{ type: 'pass' }, { type: 'pass' }, { type: 'pass' }];
      if (pr.challenge) moves.push({ type: 'challenge' });
      pr.counters.forEach((c) => moves.push({ type: 'counter', char: c }));
      if (pr.coclaim) moves.push({ type: 'coclaim' });
      return room.respond(pid, pick(moves));
    }
    case 'lose_life': return room.decide(pid, { index: pick(pr.cards), sorciere: pr.sorciere && Math.random() < 0.3 });
    case 'exchange': {
      const idx = pr.options.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, pr.keep);
      return room.decide(pid, { keep: idx, again: pr.canRepeat && Math.random() < 0.3 });
    }
    case 'show_card': return room.decide(pid, { index: pick(pr.cards) });
    case 'inquisitor': return room.decide(pid, { discard: Math.random() < 0.5 });
    case 'blackmail': return room.decide(pid, { pay: pr.canPay && Math.random() < 0.5 });
    case 'peste': return room.decide(pid, { comtesse: pr.canComtesse && Math.random() < 0.6 });
    case 'peste_pass': return room.decide(pid, { target: pick(pr.targets) });
    case 'draft': return room.decide(pid, { char: pick(pr.choices) });
    default: throw new Error('prompt inconnu : ' + pr.kind);
  }
}

test('Parties aléatoires : jamais bloquées, or et cartes conservés', () => {
  const games = parseInt(process.env.FUZZ_GAMES || '400', 10);
  const stats = { ended: 0, steps: 0, timeouts: 0 };
  for (let g = 0; g < games; g++) {
    const clock = fakeClock();
    const room = new ComplotsRoom('F' + g, { clock });
    const n = 2 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) room.addPlayer('p' + i, 'J' + i, 's' + i);
    const settings = randomSettings();
    assert.equal(room.setSettings('p0', settings), null, JSON.stringify(settings));
    assert.equal(room.start('p0'), null);
    const totalCards = n === 2 ? 5 : (n >= 7 ? 4 : 3) * 5;
    let steps = 0;
    while (room.phase === 'play') {
      assert.ok(++steps < 5000, `partie ${g} interminable (${JSON.stringify(settings)}, ${n} joueurs)`);
      const gold = room.players.reduce((s, p) => s + p.coins, 0) + room.treasury + room.hospice;
      assert.equal(gold, TOTAL_GOLD, `or ${gold} (partie ${g})`);
      room.players.forEach((p) => assert.ok(p.coins >= 0, 'or négatif'));
      if (n > 2) {
        const cards = room.players.reduce((s, p) => s + p.cards.length, 0) + room.court.length + room.inExchange.length;
        assert.equal(cards, totalCards, `cartes ${cards}/${totalCards} (partie ${g})`);
      }
      const withPrompt = room.players.filter((p) => room.viewFor(p.id).prompt);
      if (!withPrompt.length || Math.random() < 0.03) {
        if (!clock.advanceToNext()) assert.fail(`partie ${g} bloquée sans minuterie ni question`);
        stats.timeouts++;
        continue;
      }
      const p = pick(withPrompt);
      const pr = room.viewFor(p.id).prompt;
      assert.ok(randomMove(room, p.id, pr), `coup refusé ${pr.kind} (partie ${g})`);
      if (Math.random() < 0.002) room.abandon(pick(room.players).id);
    }
    assert.equal(room.phase, 'ended');
    assert.equal(room.alive().length, 1);
    stats.ended++;
    stats.steps += steps;
  }
  console.log(`  ${stats.ended} parties terminées, ${Math.round(stats.steps / stats.ended)} étapes en moyenne, ${stats.timeouts} minuteries écoulées`);
});
