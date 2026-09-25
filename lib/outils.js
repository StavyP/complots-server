'use strict';
// outils.js — Petits utilitaires partagés par tous les jeux.

/** Mélange en place (Fisher-Yates) et renvoie le tableau. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Horloge réelle ; les tests injectent une fausse horloge de même forme. */
const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

/** Code de salle de 4 lettres, sans lettres ambiguës (I, O). */
function makeCode(taken) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (taken && taken[code]);
  return code;
}

const newPlayerId = () => 'p_' + Math.random().toString(36).slice(2, 10);

/** Nettoie un pseudo reçu du client. */
function cleanName(name) {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s || 'Anonyme';
}

module.exports = { shuffle, realClock, makeCode, newPlayerId, cleanName };
