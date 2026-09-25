'use strict';
// skyjo.js — Skyjo (Magilano), règles officielles.
//
// Sources : règle express Ludovox (d'après le livret Magilano) et
// regles.com, lues le 2026-09-25.
//   - 150 cartes : 5 × −2, 10 × −1, 15 × 0, 10 × chaque valeur de 1 à 12.
//   - 12 cartes face cachée par joueur (4 colonnes de 3), 2 retournées.
//   - 1re manche : le plus gros total des 2 cartes commence ; ensuite, celui
//     qui a terminé la manche précédente.
//   - Tour : prendre la défausse (et l'échanger aussitôt), OU piocher, puis
//     échanger la carte OU la défausser et retourner une carte cachée.
//   - Colonne de 3 cartes identiques visibles : retirée, sur la défausse
//     (aussi au décompte, après révélation des cartes cachées).
//   - Le premier qui a tout révélé termine la manche : chacun des autres joue
//     encore une fois. Si son score n'est pas STRICTEMENT le plus bas, il est
//     doublé — seulement s'il est positif.
//   - Partie finie dès qu'un total atteint la cible (100) : plus petit total gagne.
const { Salle } = require('../lib/salle');
const { shuffle } = require('../lib/outils');

const CIBLES = [50, 100, 150, 200];
const TOURS = [0, 30, 60, 90]; // minuterie de tour en secondes (0 = aucune)
const AUTO_ABSENT_MS = 20000; // un joueur déconnecté joue tout seul au bout de 20 s

function nouveauPaquet() {
  const d = [];
  for (let i = 0; i < 5; i++) d.push(-2);
  for (let i = 0; i < 10; i++) d.push(-1);
  for (let i = 0; i < 15; i++) d.push(0);
  for (let v = 1; v <= 12; v++) for (let i = 0; i < 10; i++) d.push(v);
  return shuffle(d);
}

const COLONNES = [0, 1, 2, 3].map((c) => [c, c + 4, c + 8]);

function validateSettings(s) {
  const cible = Number(s.cible);
  const tour = Number(s.tour);
  if (!CIBLES.includes(cible)) return { error: 'Score de fin invalide.' };
  if (!TOURS.includes(tour)) return { error: 'Minuterie invalide.' };
  return { settings: { cible, tour } };
}

class SkyjoRoom extends Salle {
  constructor(code, opts = {}) {
    super(code, { ...opts, minPlayers: 2, maxPlayers: 8, defaultSettings: { cible: 100, tour: 0 } });
    this.g = null;
  }

  validateSettings(s) { return validateSettings(s); }

  // ── Mise en place ────────────────────────────────────────────────────────
  onStart() {
    const ids = shuffle(this.activePlayers().map((p) => p.id));
    this.g = {
      round: 0,
      seats: ids.map((id) => ({ id, grid: [], total: 0, scores: [] })),
      deck: [],
      discard: [],
      cur: null,
      step: 'reveal',
      held: null,
      heldFrom: null,
      closer: null,
      lastTurns: [],
      prevCloser: null,
      result: null,
      ready: [],
      auto: false,
    };
    this.addLog('La partie commence. Le plus petit score gagne !', 'big');
    this.startRound();
    return null;
  }

  onReset() { this.g = null; }

  seat(id) { return this.g && this.g.seats.find((s) => s.id === id); }
  inGame(id) { const p = this.player(id); return !!p && !p.left && !!this.seat(id); }
  liveSeats() { return this.g.seats.filter((s) => !this.player(s.id)?.left); }
  nameOf(id) { return this.player(id)?.name || '?'; }

  startRound() {
    const g = this.g;
    g.round++;
    g.deck = nouveauPaquet();
    g.discard = [];
    for (const s of g.seats) {
      // Un joueur parti ne reçoit plus de cartes.
      s.grid = this.player(s.id)?.left ? [] : Array.from({ length: 12 }, () => ({ v: g.deck.pop(), up: false, gone: false }));
      s.revealed = 0;
    }
    g.discard.push(g.deck.pop());
    g.cur = null;
    g.step = 'reveal';
    g.held = null;
    g.heldFrom = null;
    g.closer = null;
    g.lastTurns = [];
    g.result = null;
    g.ready = [];
    this.addLog(`Manche ${g.round} : chacun retourne 2 cartes.`, 'big');
    this.addFx('deal', { round: g.round });
    this.armTimer();
  }

  // ── Retourner 2 cartes au début de la manche ─────────────────────────────
  actReveal(pid, { i } = {}) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'reveal' || !this.inGame(pid)) return false;
    const s = this.seat(pid);
    const c = s.grid[i];
    if (s.revealed >= 2 || !c || c.up || c.gone) return false;
    c.up = true;
    s.revealed++;
    this.addFx('flip', { pid, i, v: c.v });
    if (this.liveSeats().every((x) => x.revealed >= 2)) this.beginTurns();
    else this.armTimer();
    this.changed();
    return true;
  }

  beginTurns() {
    const g = this.g;
    const live = this.liveSeats();
    let first = g.round > 1 && live.find((s) => s.id === g.prevCloser);
    if (first) {
      this.addLog(`${this.nameOf(first.id)} a fini la manche précédente : à lui/elle de commencer.`);
    } else {
      const sum = (s) => s.grid.reduce((t, c) => t + (c.up && !c.gone ? c.v : 0), 0);
      const best = Math.max(...live.map(sum));
      const tied = live.filter((s) => sum(s) === best);
      first = tied[Math.floor(Math.random() * tied.length)];
      this.addLog(`${this.nameOf(first.id)} a le plus gros total (${best})${tied.length > 1 ? ', tiré au sort parmi les ex æquo' : ''} : il/elle commence.`);
    }
    g.cur = first.id;
    g.step = 'choose';
    this.addFx('turn', { pid: g.cur });
    this.armTimer();
  }

  // ── Un tour ──────────────────────────────────────────────────────────────
  myTurn(pid, ...steps) {
    const g = this.g;
    return !!g && this.phase === 'play' && g.cur === pid && steps.includes(g.step);
  }

  piocher() {
    const g = this.g;
    if (!g.deck.length) {
      // Pioche épuisée : on remélange la défausse, sauf sa carte du dessus.
      const top = g.discard.pop();
      g.deck = shuffle(g.discard);
      g.discard = [top];
      this.addLog('La pioche est vide : la défausse est remélangée.');
      this.addFx('reshuffle', {});
    }
    return g.deck.pop();
  }

  actDraw(pid) {
    if (!this.myTurn(pid, 'choose')) return false;
    const g = this.g;
    g.held = this.piocher();
    g.heldFrom = 'deck';
    g.step = 'drawn';
    this.addFx('draw', { pid, v: g.held });
    this.armTimer();
    this.changed();
    return true;
  }

  actTake(pid) {
    if (!this.myTurn(pid, 'choose') || !this.g.discard.length) return false;
    const g = this.g;
    g.held = g.discard.pop();
    g.heldFrom = 'discard';
    g.step = 'took';
    this.addFx('take', { pid, v: g.held });
    this.armTimer();
    this.changed();
    return true;
  }

  /** Échanger la carte en main avec une carte de sa grille (visible ou cachée). */
  actPlace(pid, { i } = {}) {
    if (!this.myTurn(pid, 'drawn', 'took')) return false;
    const g = this.g;
    const s = this.seat(pid);
    const c = s.grid[i];
    if (!c || c.gone) return false;
    const old = c.v;
    const wasUp = c.up;
    c.v = g.held;
    c.up = true;
    g.discard.push(old);
    this.addFx('place', { pid, i, v: c.v, old, wasUp, from: g.heldFrom });
    this.addLog(`${this.nameOf(pid)} pose un ${c.v}${g.heldFrom === 'discard' ? ' pris à la défausse' : ''} et défausse un ${old}.`);
    g.held = null;
    g.heldFrom = null;
    this.afterMove(pid, i);
    this.changed();
    return true;
  }

  /** Refuser la carte piochée : elle va sur la défausse, puis on retourne une carte. */
  actDiscard(pid) {
    if (!this.myTurn(pid, 'drawn')) return false;
    const g = this.g;
    const s = this.seat(pid);
    if (!s.grid.some((c) => !c.up && !c.gone)) return false;
    g.discard.push(g.held);
    this.addFx('discard', { pid, v: g.held });
    g.held = null;
    g.heldFrom = null;
    g.step = 'flip';
    this.armTimer();
    this.changed();
    return true;
  }

  actFlip(pid, { i } = {}) {
    if (!this.myTurn(pid, 'flip')) return false;
    const s = this.seat(pid);
    const c = s.grid[i];
    if (!c || c.up || c.gone) return false;
    c.up = true;
    this.addFx('flip', { pid, i, v: c.v });
    this.addLog(`${this.nameOf(pid)} défausse la pioche et retourne un ${c.v}.`);
    this.afterMove(pid, i);
    this.changed();
    return true;
  }

  /** Colonnes de 3 cartes identiques visibles : retirées, posées sur la défausse. */
  clearColumns(s, pid, only = null) {
    let n = 0;
    for (const [col, idx] of COLONNES.entries()) {
      if (only !== null && col !== only) continue;
      const cells = idx.map((k) => s.grid[k]);
      if (cells.every((c) => c.up && !c.gone && c.v === cells[0].v)) {
        cells.forEach((c) => { c.gone = true; this.g.discard.push(c.v); });
        this.addFx('column', { pid, col, v: cells[0].v });
        this.addLog(`${this.nameOf(pid)} aligne trois ${cells[0].v} : la colonne disparaît !`, 'good');
        n++;
      }
    }
    return n;
  }

  afterMove(pid, i) {
    const g = this.g;
    const s = this.seat(pid);
    this.clearColumns(s, pid, i % 4);
    if (g.closer === null && s.grid.every((c) => c.up || c.gone)) {
      g.closer = pid;
      g.lastTurns = this.liveSeats().filter((x) => x.id !== pid).map((x) => x.id);
      this.addFx('closer', { pid });
      this.addLog(`${this.nameOf(pid)} a tout révélé : dernier tour pour les autres !`, 'big');
    } else if (g.closer !== null) {
      g.lastTurns = g.lastTurns.filter((id) => id !== pid);
    }
    this.nextTurn();
  }

  nextTurn() {
    const g = this.g;
    g.held = null;
    g.heldFrom = null;
    if (g.closer !== null && !g.lastTurns.length) return this.endRound();
    const order = g.seats.map((s) => s.id);
    let k = order.indexOf(g.cur);
    for (let n = 0; n < order.length; n++) {
      k = (k + 1) % order.length;
      const id = order[k];
      if (this.player(id)?.left) continue;
      if (g.closer !== null && !g.lastTurns.includes(id)) continue;
      g.cur = id;
      g.step = 'choose';
      this.addFx('turn', { pid: id });
      this.armTimer();
      return;
    }
    this.endRound();
  }

  // ── Fin de manche ────────────────────────────────────────────────────────
  endRound() {
    const g = this.g;
    this.clearTimer();
    g.cur = null;
    g.step = 'roundEnd';
    const live = this.liveSeats();
    for (const s of live) {
      s.grid.forEach((c) => { if (!c.gone) c.up = true; });
      this.clearColumns(s, s.id);
    }
    this.addFx('revealAll', {});
    const raw = new Map(live.map((s) => [s.id, s.grid.reduce((t, c) => t + (c.gone ? 0 : c.v), 0)]));
    const closerRaw = raw.get(g.closer);
    const doubled = g.closer !== null && closerRaw !== undefined && closerRaw > 0
      && live.some((s) => s.id !== g.closer && raw.get(s.id) <= closerRaw);
    g.result = live.map((s) => {
      const r = raw.get(s.id);
      const score = s.id === g.closer && doubled ? r * 2 : r;
      s.total += score;
      s.scores.push(score);
      return { id: s.id, raw: r, score, doubled: s.id === g.closer && doubled, closer: s.id === g.closer };
    });
    if (g.closer !== null) {
      this.addLog(doubled
        ? `${this.nameOf(g.closer)} n'a pas le plus petit score : ses ${closerRaw} points sont doublés !`
        : `${this.nameOf(g.closer)} a fermé la manche avec le plus petit score. Bien joué !`, doubled ? 'bad' : 'good');
    }
    g.prevCloser = g.closer;
    this.addFx('round', { round: g.round, doubled });
    const fini = live.some((s) => s.total >= this.settings.cible);
    if (fini) {
      const best = Math.min(...live.map((s) => s.total));
      const winners = live.filter((s) => s.total === best).map((s) => s.id);
      this.addLog(`Fin de partie : ${winners.map((id) => this.nameOf(id)).join(' et ')} gagne${winners.length > 1 ? 'nt' : ''} avec ${best} points.`, 'big');
      this.finish(winners, { reason: 'score', best });
    } else {
      this.addLog(`Fin de la manche ${g.round}.`, 'big');
    }
  }

  /** Prêt pour la manche suivante ; quand tous les joueurs connectés le sont, on repart. */
  actReady(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'roundEnd' || !this.inGame(pid)) return false;
    if (!g.ready.includes(pid)) g.ready.push(pid);
    this.maybeNextRound();
    this.changed();
    return true;
  }

  /** L'hôte lance la manche suivante sans attendre les retardataires. */
  actForce(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'roundEnd' || pid !== this.hostId) return false;
    this.startRound();
    this.changed();
    return true;
  }

  maybeNextRound() {
    const g = this.g;
    const waiting = this.liveSeats().filter((s) => this.player(s.id)?.connected && !g.ready.includes(s.id));
    if (!waiting.length) this.startRound();
  }

  // ── Absents, minuterie, départs ──────────────────────────────────────────
  armTimer() {
    const g = this.g;
    this.clearTimer();
    if (!g || this.phase !== 'play') return;
    const tourMs = this.settings.tour * 1000;
    if (g.step === 'reveal') {
      const absents = this.liveSeats().some((s) => s.revealed < 2 && !this.player(s.id)?.connected);
      const ms = tourMs ? Math.max(tourMs, 30000) : absents ? AUTO_ABSENT_MS : 0;
      if (ms) this.setTimer(ms, () => this.autoReveal(!tourMs));
      return;
    }
    if (g.cur && ['choose', 'drawn', 'took', 'flip'].includes(g.step)) {
      const absent = !this.player(g.cur)?.connected;
      const ms = absent ? (tourMs ? Math.min(tourMs, AUTO_ABSENT_MS) : AUTO_ABSENT_MS) : tourMs;
      if (ms) this.setTimer(ms, () => this.autoPlay());
    }
  }

  autoReveal(absentsOnly) {
    const g = this.g;
    if (!g || g.step !== 'reveal') return;
    for (const s of this.liveSeats()) {
      if (absentsOnly && this.player(s.id)?.connected) continue;
      while (s.revealed < 2) {
        const hidden = s.grid.map((c, k) => (!c.up ? k : -1)).filter((k) => k >= 0);
        const k = hidden[Math.floor(Math.random() * hidden.length)];
        s.grid[k].up = true;
        s.revealed++;
        this.addFx('flip', { pid: s.id, i: k, v: s.grid[k].v });
      }
    }
    if (this.liveSeats().every((x) => x.revealed >= 2)) this.beginTurns();
    else this.armTimer();
  }

  /** Coup joué à la place du joueur (temps écoulé ou absent) : prudent et simple. */
  autoPlay() {
    const g = this.g;
    if (!g || !g.cur) return;
    const pid = g.cur;
    const s = this.seat(pid);
    const hidden = () => s.grid.map((c, k) => (!c.up && !c.gone ? k : -1)).filter((k) => k >= 0);
    const worstUp = () => {
      let best = -1;
      s.grid.forEach((c, k) => { if (c.up && !c.gone && (best < 0 || c.v > s.grid[best].v)) best = k; });
      return best;
    };
    this.addLog(`${this.nameOf(pid)} tarde : coup joué automatiquement.`, 'muted');
    if (g.step === 'choose') this.actDraw(pid);
    if (g.step === 'drawn' || g.step === 'took') {
      const w = worstUp();
      if (w >= 0 && s.grid[w].v > g.held) return this.actPlace(pid, { i: w });
      const h = hidden();
      if (g.step === 'took' || !h.length) return this.actPlace(pid, { i: h.length ? h[0] : w });
      if (g.held <= 3) return this.actPlace(pid, { i: h[Math.floor(Math.random() * h.length)] });
      this.actDiscard(pid);
    }
    if (g.step === 'flip') {
      const h = hidden();
      this.actFlip(pid, { i: h[Math.floor(Math.random() * h.length)] });
    }
  }

  onConnectionChange() {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    if (g.step === 'roundEnd') return this.maybeNextRound();
    this.armTimer();
  }

  onLeave(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    this.addLog(`${this.nameOf(pid)} quitte la partie.`, 'bad');
    const live = this.liveSeats();
    if (live.length < 2) {
      const winners = live.map((s) => s.id);
      this.finish(winners, { reason: 'abandon' });
      return;
    }
    g.lastTurns = g.lastTurns.filter((id) => id !== pid);
    if (g.step === 'reveal') {
      if (live.every((x) => x.revealed >= 2)) this.beginTurns();
      return;
    }
    if (g.step === 'roundEnd') return this.maybeNextRound();
    // S'il avait fermé la manche, elle reste fermée : les autres finissent leur dernier tour.
    if (g.cur === pid) {
      if (g.held !== null) g.discard.push(g.held);
      this.nextTurn();
    }
  }

  // ── Vue ──────────────────────────────────────────────────────────────────
  gameView() {
    const g = this.g;
    if (!g) return null;
    return {
      round: g.round,
      step: g.step,
      cur: g.cur,
      cible: this.settings.cible,
      seats: g.seats.map((s) => ({
        id: s.id,
        total: s.total,
        scores: s.scores,
        revealed: s.revealed,
        // Carte cachée : valeur inconnue de TOUT le monde, propriétaire compris.
        grid: s.grid.map((c) => ({ v: c.up || c.gone ? c.v : null, up: c.up, gone: c.gone })),
      })),
      deckCount: g.deck.length,
      discardTop: g.discard.length ? g.discard[g.discard.length - 1] : null,
      discardCount: g.discard.length,
      held: g.held,
      heldFrom: g.heldFrom,
      closer: g.closer,
      lastTurns: g.lastTurns,
      result: g.result,
      ready: g.ready,
    };
  }
}

module.exports = {
  id: 'skyjo',
  createRoom: (code, opts) => new SkyjoRoom(code, opts),
  events: {
    'game:reveal': 'actReveal',
    'game:draw': 'actDraw',
    'game:take': 'actTake',
    'game:place': 'actPlace',
    'game:discard': 'actDiscard',
    'game:flip': 'actFlip',
    'game:ready': 'actReady',
    'game:force': 'actForce',
  },
  SkyjoRoom,
  nouveauPaquet,
  validateSettings,
};
