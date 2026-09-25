'use strict';
// aide.js — Outils communs aux tests des moteurs (pas un fichier de test).

/** Fausse horloge : le temps n'avance que sur `advance(ms)`. */
function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => { const h = ++seq; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout: (h) => timers.delete(h),
    pending: () => timers.size,
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].fn();
      }
      t = end;
    },
  };
}

module.exports = { fakeClock };
