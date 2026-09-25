'use strict';
// wavelength.js — Wavelength (Alex Hague, Justin Vickers, Wolfgang Warsch).
//
// Sources (lues le 2026-09-25) : ultraboardgames.com/wavelength/game-rules.php
// et geekyhobbies.com (règles officielles, modes compétitif et coopératif).
//
// Mode ÉQUIPES (4 joueurs et plus, 2 équipes d'au moins 2) :
//   - L'équipe qui commence part de 0 point, l'autre de 1.
//   - Le médium de l'équipe active choisit un des deux spectres de sa carte,
//     voit seul la cible, donne UN indice. Son équipe règle le cadran.
//   - L'équipe adverse devine si le centre de la cible est à GAUCHE ou à
//     DROITE du cadran : +1 si elle a raison, sauf si l'équipe active a fait 4.
//   - Zones : 4 au centre, 3 de part et d'autre, puis 2. Sur une limite,
//     l'équipe active marque la meilleure des deux.
//   - Rattrapage : une équipe qui fait 4 et reste derrière rejoue aussitôt
//     (avec un autre médium).
//   - Fin dès qu'une équipe atteint 10 : le plus haut score gagne ; égalité →
//     chaque équipe rejoue un tour, jusqu'à ce que l'une passe devant.
// Mode COOPÉRATIF (2 joueurs et plus) :
//   - 7 cartes ; pas de gauche/droite ; le centre ne vaut que 3 points mais
//     ajoute une carte bonus. Score final comparé au barème de la boîte.
const { Salle } = require('../lib/salle');
const { shuffle } = require('../lib/outils');
const CARTES = require('./wavelength-cartes');

// Largeur des zones sur un cadran de 0 à 100 : la cible entière (2-3-4-3-2)
// couvre 20 % du cadran, comme la roue du jeu.
const BANDE = 4;
const ABSENT_MS = 30000;
const CIBLES = [7, 10, 15];

function points(target, dial) {
  const d = Math.abs(target - dial);
  if (d <= BANDE / 2) return 4;
  if (d <= BANDE * 1.5) return 3;
  if (d <= BANDE * 2.5) return 2;
  return 0;
}

const BAREME = [
  [0, 'Tu es sûr que c’est branché ?'],
  [4, 'Essaie de l’éteindre et de le rallumer.'],
  [7, 'Souffle dans le fond de l’appareil.'],
  [10, 'Pas mal ! Pas génial, mais pas mal.'],
  [13, 'SI PROCHE !'],
  [16, 'Vous avez gagné !'],
  [19, 'Vous êtes sur la même… longueur d’onde.'],
  [22, 'Cerveau galactique.'],
  [25, 'Explosion de cerveau 🤯'],
];
const appreciation = (score) => [...BAREME].reverse().find(([min]) => score >= min)[1];

function validateSettings(s) {
  const mode = s.mode === 'coop' ? 'coop' : s.mode === 'equipes' ? 'equipes' : 'auto';
  const cible = Number(s.cible);
  if (!CIBLES.includes(cible)) return { error: 'Score de victoire invalide.' };
  return { settings: { mode, cible } };
}

const EQUIPES = ['Cerveau gauche', 'Cerveau droit'];

class WavelengthRoom extends Salle {
  constructor(code, opts = {}) {
    super(code, { ...opts, minPlayers: 2, maxPlayers: 12, defaultSettings: { mode: 'auto', cible: 10 } });
    this.g = null;
    this.teamOf = {}; // choix d'équipe fait au salon : pid → 0 | 1
  }

  validateSettings(s) { return validateSettings(s); }

  // ── Salon : équipes ─────────────────────────────────────────────────────
  modeEffectif() {
    const n = this.activePlayers().length;
    if (this.settings.mode === 'auto') return n >= 4 ? 'equipes' : 'coop';
    return this.settings.mode;
  }

  addPlayer(id, name, socketId) {
    const err = super.addPlayer(id, name, socketId);
    if (!err) this.equilibrer(id);
    return err;
  }

  /** Place un nouveau venu dans l'équipe la moins nombreuse. */
  equilibrer(id) {
    const count = [0, 1].map((t) => this.players.filter((p) => p.id !== id && this.teamOf[p.id] === t).length);
    this.teamOf[id] = count[0] <= count[1] ? 0 : 1;
  }

  actTeam(pid, { team } = {}) {
    if (this.started || !this.player(pid) || ![0, 1].includes(team)) return false;
    this.teamOf[pid] = team;
    this.changed();
    return true;
  }

  actShuffleTeams(pid) {
    if (this.started || pid !== this.hostId) return false;
    shuffle([...this.players]).forEach((p, i) => { this.teamOf[p.id] = i % 2; });
    this.changed();
    return true;
  }

  // ── Mise en place ────────────────────────────────────────────────────────
  onStart() {
    const mode = this.modeEffectif();
    const ids = this.activePlayers().map((p) => p.id);
    const members = {};
    if (mode === 'equipes') {
      ids.forEach((id) => { if (this.teamOf[id] === undefined) this.equilibrer(id); members[id] = this.teamOf[id]; });
      const sizes = [0, 1].map((t) => ids.filter((id) => members[id] === t).length);
      if (sizes[0] < 2 || sizes[1] < 2) return 'Mode équipes : il faut au moins 2 joueurs dans chaque équipe.';
    } else {
      ids.forEach((id) => { members[id] = 0; });
    }
    const first = mode === 'equipes' ? Math.floor(Math.random() * 2) : 0;
    this.g = {
      mode,
      cible: this.settings.cible,
      members,
      order: [0, 1].map((t) => shuffle(ids.filter((id) => members[id] === t))),
      next: [0, 0], // prochain médium de chaque équipe (indice dans order)
      scores: mode === 'equipes' ? (first === 0 ? [0, 1] : [1, 0]) : [0],
      turnTeam: first,
      deck: shuffle(CARTES.map((c) => [...c])),
      turn: 0,
      phase: 'pick',
      psychic: null,
      options: [],
      card: null,
      clue: null,
      target: null,
      dial: 50,
      dialBy: null,
      lr: null,
      lrBy: null,
      result: null,
      history: [],
      coop: mode === 'coop' ? { total: 7, played: 0, score: 0, bonus: 0 } : null,
      tie: null,
      ready: [],
    };
    this.addLog(mode === 'equipes'
      ? `Deux équipes : ${EQUIPES[0]} contre ${EQUIPES[1]}. ${EQUIPES[first]} commence ; l’autre équipe part avec 1 point.`
      : 'Mode coopératif : 7 cartes pour marquer le plus de points ensemble.', 'big');
    this.startTurn(first, false);
    return null;
  }

  onReset() { this.g = null; }

  here(id) { const p = this.player(id); return !!p && !p.left; }
  nameOf(id) { return this.player(id)?.name || '?'; }
  teamIds(t) { return this.g.order[t].filter((id) => this.here(id)); }
  guessers() { return this.teamIds(this.g.turnTeam).filter((id) => id !== this.g.psychic); }
  opponents() { return this.g.mode === 'equipes' ? this.teamIds(1 - this.g.turnTeam) : []; }

  piocher() {
    const g = this.g;
    if (g.deck.length < 2) g.deck = shuffle(CARTES.map((c) => [...c]));
    return [g.deck.pop(), g.deck.pop()];
  }

  /** Nouveau tour pour l'équipe `team` (médium suivant de cette équipe). */
  startTurn(team, catchUp) {
    const g = this.g;
    g.turnTeam = team;
    const list = g.order[team];
    let psychic = null;
    // Médium suivant de l'équipe, de préférence quelqu'un de connecté.
    for (const wantOnline of [true, false]) {
      for (let k = 0; k < list.length && !psychic; k++) {
        const id = list[(g.next[team] + k) % list.length];
        if (this.here(id) && (!wantOnline || this.player(id)?.connected)) {
          psychic = id;
          g.next[team] = (g.next[team] + k + 1) % list.length;
        }
      }
      if (psychic) break;
    }
    g.turn++;
    g.psychic = psychic;
    g.phase = 'pick';
    g.options = this.piocher();
    g.card = null;
    g.clue = null;
    g.target = Math.round(Math.random() * 1000) / 10;
    g.dial = 50;
    g.dialBy = null;
    g.lr = null;
    g.lrBy = null;
    g.result = null;
    g.ready = [];
    g.catchUp = !!catchUp;
    this.addFx('turn', { psychic, team, catchUp: !!catchUp });
    this.addLog(`${this.nameOf(psychic)} est le médium${g.mode === 'equipes' ? ` (${EQUIPES[team]})` : ''}${catchUp ? ' — règle de rattrapage !' : ''}.`, catchUp ? 'good' : 'info');
    this.armTimer();
  }

  // ── Le médium ────────────────────────────────────────────────────────────
  actPick(pid, { index } = {}) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.phase !== 'pick' || pid !== g.psychic || ![0, 1].includes(index)) return false;
    g.card = g.options[index];
    g.phase = 'clue';
    this.armTimer();
    this.changed();
    return true;
  }

  actClue(pid, { clue } = {}) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.phase !== 'clue' || pid !== g.psychic) return false;
    const text = String(clue ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!text) return false;
    g.clue = text;
    g.phase = 'guess';
    this.addFx('clue', { clue: text });
    this.addLog(`Indice de ${this.nameOf(pid)} : « ${text} » (${g.card[0]} ↔ ${g.card[1]}).`, 'big');
    this.armTimer();
    this.changed();
    return true;
  }

  // ── L'équipe règle le cadran ─────────────────────────────────────────────
  actDial(pid, { value } = {}) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.phase !== 'guess' || !this.guessers().includes(pid)) return false;
    const v = Number(value);
    if (!Number.isFinite(v)) return false;
    g.dial = Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
    g.dialBy = pid;
    this.changed();
    return true;
  }

  actLock(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.phase !== 'guess' || !this.guessers().includes(pid)) return false;
    this.addLog(`${this.nameOf(pid)} valide le cadran.`);
    this.addFx('lock', { pid, dial: g.dial });
    if (g.mode === 'equipes' && this.opponents().length) {
      g.phase = 'lr';
      this.armTimer();
    } else {
      this.resolve();
    }
    this.changed();
    return true;
  }

  // ── L'équipe adverse : gauche ou droite ? ────────────────────────────────
  actLR(pid, { side } = {}) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.phase !== 'lr' || !this.opponents().includes(pid) || !['left', 'right'].includes(side)) return false;
    g.lr = side;
    g.lrBy = pid;
    this.changed();
    return true;
  }

  actLRLock(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.phase !== 'lr' || !this.opponents().includes(pid) || !g.lr) return false;
    this.resolve();
    this.changed();
    return true;
  }

  // ── Révélation ───────────────────────────────────────────────────────────
  resolve() {
    const g = this.g;
    this.clearTimer();
    const pts = points(g.target, g.dial);
    const res = { points: pts, lrPoints: 0, lrOk: null, catchUp: false, bonus: false, dial: g.dial, target: g.target };
    if (g.mode === 'equipes') {
      g.scores[g.turnTeam] += pts;
      if (g.lr && g.target !== g.dial) {
        const bon = g.target < g.dial ? 'left' : 'right';
        res.lrOk = g.lr === bon;
        if (res.lrOk && pts < 4) {
          res.lrPoints = 1;
          g.scores[1 - g.turnTeam] += 1;
        }
      }
      res.catchUp = pts === 4 && g.scores[g.turnTeam] < g.scores[1 - g.turnTeam];
    } else {
      const c = g.coop;
      c.played++;
      if (pts === 4) {
        c.score += 3;
        c.bonus++;
        c.total++;
        res.bonus = true;
      } else {
        c.score += pts;
      }
    }
    g.result = res;
    g.phase = 'reveal';
    g.history.push({ psychic: g.psychic, team: g.turnTeam, card: g.card, clue: g.clue, target: g.target, dial: g.dial, points: pts, lrPoints: res.lrPoints });
    this.addFx('reveal', { points: pts, lrPoints: res.lrPoints, bonus: res.bonus });
    const msg = pts === 4 ? 'En plein dans le mille : 4 points !' : pts ? `${pts} points.` : 'Raté : 0 point.';
    this.addLog(`${msg}${res.lrPoints ? ` L’autre équipe avait deviné le bon côté : +1.` : ''}${res.bonus ? ' Carte bonus !' : ''}`, pts === 4 ? 'good' : pts ? 'info' : 'bad');
    if (this.checkEnd()) return;
    this.armTimer();
  }

  checkEnd() {
    const g = this.g;
    if (g.mode === 'coop') {
      if (g.coop.played >= g.coop.total) {
        const ids = this.activePlayers().map((p) => p.id);
        this.addLog(`Fin : ${g.coop.score} points. ${appreciation(g.coop.score)}`, 'big');
        this.finish(ids, { reason: 'coop', score: g.coop.score, appreciation: appreciation(g.coop.score) });
        return true;
      }
      return false;
    }
    const [a, b] = g.scores;
    if (Math.max(a, b) < g.cible) return false;
    if (a === b) {
      // Égalité au-delà de la cible : chaque équipe rejoue, jusqu'à départager.
      if (!g.tie) {
        g.tie = { since: g.turn };
        this.addLog('Égalité ! Chaque équipe rejoue un tour pour départager.', 'big');
      }
      return false;
    }
    if (g.tie && (g.turn - g.tie.since) % 2 !== 0) return false; // l'autre équipe n'a pas encore rejoué
    const win = a > b ? 0 : 1;
    const ids = this.teamIds(win);
    this.addLog(`${EQUIPES[win]} gagne ${Math.max(a, b)} à ${Math.min(a, b)} !`, 'big');
    this.finish(ids, { reason: 'score', team: win, scores: [a, b] });
    return true;
  }

  /** Tour suivant : le prochain médium (ou l'hôte) lance ; tout seul après 30 s si besoin. */
  actNext(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.phase !== 'reveal' || !this.here(pid)) return false;
    this.nextTurn();
    this.changed();
    return true;
  }

  nextTurn() {
    const g = this.g;
    if (g.mode === 'coop') return this.startTurn(0, false);
    if (g.result?.catchUp) return this.startTurn(g.turnTeam, true);
    return this.startTurn(1 - g.turnTeam, false);
  }

  // ── Absents, départs ─────────────────────────────────────────────────────
  armTimer() {
    const g = this.g;
    this.clearTimer();
    if (!g || this.phase !== 'play') return;
    const off = (id) => !this.player(id)?.connected;
    let stuck = false;
    if (g.phase === 'pick' || g.phase === 'clue') stuck = !g.psychic || off(g.psychic);
    else if (g.phase === 'guess') stuck = this.guessers().every(off);
    else if (g.phase === 'lr') stuck = this.opponents().every(off);
    if (stuck) this.setTimer(ABSENT_MS, () => this.unstick());
  }

  unstick() {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    if (g.phase === 'pick' || g.phase === 'clue') {
      this.addLog(`${this.nameOf(g.psychic)} est absent : un autre médium prend la main.`, 'muted');
      g.turn--;
      this.startTurn(g.turnTeam, g.catchUp);
    } else if (g.phase === 'guess') {
      this.addLog('Personne pour régler le cadran : il est validé tel quel.', 'muted');
      if (g.mode === 'equipes' && this.opponents().some((id) => this.player(id)?.connected)) { g.phase = 'lr'; this.armTimer(); } else this.resolve();
    } else if (g.phase === 'lr') {
      this.addLog('L’autre équipe est absente : pas de pari gauche/droite.', 'muted');
      g.lr = null;
      this.resolve();
    }
  }

  onConnectionChange() {
    if (this.g && this.phase === 'play' && this.g.phase !== 'reveal') this.armTimer();
  }

  onLeave(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    this.addLog(`${this.nameOf(pid)} quitte la partie.`, 'bad');
    if (g.mode === 'equipes') {
      const sizes = [0, 1].map((t) => this.teamIds(t).length);
      if (!sizes[0] || !sizes[1]) {
        const win = sizes[0] ? 0 : 1;
        this.finish(this.teamIds(win), { reason: 'abandon', team: win, scores: g.scores });
        return;
      }
    } else if (this.activePlayers().length < 2) {
      this.finish(this.activePlayers().map((p) => p.id), { reason: 'abandon' });
      return;
    }
    if (g.phase === 'reveal') return;
    if (pid === g.psychic) {
      // Le médium est parti : même équipe, médium suivant, nouvelle carte.
      g.turn--;
      this.startTurn(g.turnTeam, g.catchUp);
      return;
    }
    if (g.phase === 'guess' && !this.guessers().length) this.resolve();
    else this.armTimer();
  }

  // ── Vue ──────────────────────────────────────────────────────────────────
  viewFor(pid) {
    const v = super.viewFor(pid);
    // Au salon, chacun voit les équipes choisies et le mode qui sera joué.
    v.teams = this.teamOf;
    v.modeEffectif = this.modeEffectif();
    return v;
  }

  gameView(pid) {
    const g = this.g;
    if (!g) return null;
    const isPsychic = pid === g.psychic;
    const reveal = g.phase === 'reveal' || this.phase === 'ended';
    return {
      mode: g.mode,
      cible: g.cible,
      equipes: EQUIPES,
      members: g.members,
      scores: g.scores,
      turnTeam: g.turnTeam,
      turn: g.turn,
      phase: g.phase,
      psychic: g.psychic,
      options: isPsychic && g.phase === 'pick' ? g.options : null,
      card: g.card,
      clue: g.clue,
      // La cible : le médium seul, puis tout le monde à la révélation.
      target: isPsychic || reveal ? g.target : null,
      dial: g.dial,
      dialBy: g.dialBy,
      lr: g.lr,
      lrBy: g.lrBy,
      result: g.result,
      catchUp: g.catchUp,
      coop: g.coop,
      tie: !!g.tie,
      history: g.history.slice(-12),
      bande: BANDE,
    };
  }
}

module.exports = {
  id: 'wavelength',
  createRoom: (code, opts) => new WavelengthRoom(code, opts),
  events: {
    'game:team': 'actTeam',
    'game:shuffle-teams': 'actShuffleTeams',
    'game:pick': 'actPick',
    'game:clue': 'actClue',
    'game:dial': 'actDial',
    'game:lock': 'actLock',
    'game:lr': 'actLR',
    'game:lr-lock': 'actLRLock',
    'game:next': 'actNext',
  },
  WavelengthRoom,
  points,
  appreciation,
  BANDE,
  EQUIPES,
  validateSettings,
};
