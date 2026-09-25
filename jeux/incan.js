'use strict';
// incan.js — Incan Gold (Diamant) d'Alan R. Moon et Bruno Faidutti.
//
// Source : livret officiel Sunriver Games 2006 (lu le 2026-09-25).
//   - 30 cartes Quête : 15 Trésors (1,2,3,4,5,5,7,7,9,11,11,13,14,15,17) et
//     15 Dangers (3 × serpents, araignées, momies, flammes, éboulement),
//     + 5 Reliques : une nouvelle est mélangée au paquet à chaque manche ;
//     une relique pas encore sortie reste dans le paquet pour les manches suivantes.
//   - 5 manches. À chaque tour, les joueurs encore dans le temple choisissent
//     EN SECRET et EN MÊME TEMPS : continuer (torche) ou rentrer (camp).
//   - Ceux qui rentrent se partagent les gemmes laissées sur le chemin (le reste
//     de la division reste sur le chemin) et mettent leurs gemmes de la manche à
//     l'abri dans leur tente. Si UN SEUL rentre, il emporte aussi toutes les
//     reliques du chemin : les 3 premières sorties du temple valent 5, les
//     suivantes 10.
//   - Ceux qui continuent révèlent une carte : un Trésor est partagé entre eux
//     (arrondi à l'inférieur, le reste reste sur la carte) ; une Relique reste
//     sur le chemin ; un 2e Danger identique chasse tout le monde : ceux qui
//     étaient dedans perdent leurs gemmes de la manche, et cette carte Danger
//     est retirée du jeu.
//   - Reliques restées sur le chemin en fin de manche : perdues.
//   - La première carte d'une manche est révélée sans choix (et si c'est un
//     Danger, on en révèle une autre tout de suite).
//   - Fin : la plus grande richesse gagne ; égalité → le plus de reliques.
const { Salle } = require('../lib/salle');
const { shuffle } = require('../lib/outils');

const TRESORS = [1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17];
const DANGERS = ['serpent', 'araignee', 'momie', 'feu', 'eboulement'];
const RELIQUES = ['Idole d’or', 'Masque de jade', 'Coupe du soleil', 'Statuette du jaguar', 'Collier de plumes'];
const CHOIX = [0, 20, 40, 60]; // minuterie des choix, en secondes (0 = aucune)
const ABSENT_MS = 15000; // un joueur déconnecté rentre au camp au bout de 15 s
const REVEAL_MS = 1600; // pause entre la révélation des choix et la carte suivante
const PAUSE_MS = 25000; // fin de manche : la suivante démarre seule au bout de 25 s

function validateSettings(s) {
  const choix = Number(s.choix);
  if (!CHOIX.includes(choix)) return { error: 'Minuterie invalide.' };
  return { settings: { choix, reliques: s.reliques !== false, coffres: !!s.coffres } };
}

const valeurRelique = (rang) => (rang < 3 ? 5 : 10);

class IncanRoom extends Salle {
  constructor(code, opts = {}) {
    super(code, { ...opts, minPlayers: 2, maxPlayers: 8, defaultSettings: { choix: 40, reliques: true, coffres: false } });
    this.g = null;
  }

  validateSettings(s) { return validateSettings(s); }

  // ── Mise en place ────────────────────────────────────────────────────────
  onStart() {
    const reliques = shuffle(RELIQUES.map((name, k) => ({ kind: 'relique', id: `r${k}`, name })));
    this.g = {
      round: 0,
      rounds: 5,
      explorers: this.activePlayers().map((p) => ({ id: p.id, tent: 0, gems: 0, reliques: [], inside: false, choice: null })),
      aVenir: this.settings.reliques ? reliques : [], // reliques pas encore annoncées
      dansLePaquet: [], // reliques annoncées mais pas encore sorties
      reliquesSorties: 0,
      retires: [], // dangers retirés du jeu (un type par carte)
      deck: [],
      path: [],
      seen: {},
      step: 'decide',
      reveal: null,
      history: [],
      ready: [],
      roundInfo: null,
    };
    this.addLog('L’expédition commence : 5 manches dans le temple.', 'big');
    this.startRound();
    return null;
  }

  onReset() { this.g = null; }

  ex(id) { return this.g && this.g.explorers.find((e) => e.id === id); }
  here(id) { const p = this.player(id); return !!p && !p.left; }
  liveExplorers() { return this.g.explorers.filter((e) => this.here(e.id)); }
  inside() { return this.g.explorers.filter((e) => e.inside && this.here(e.id)); }
  nameOf(id) { return this.player(id)?.name || '?'; }

  startRound() {
    const g = this.g;
    g.round++;
    const dangers = [];
    for (const t of DANGERS) {
      const n = 3 - g.retires.filter((x) => x === t).length;
      for (let k = 0; k < n; k++) dangers.push({ kind: 'danger', type: t });
    }
    if (g.aVenir.length) g.dansLePaquet.push(g.aVenir.shift());
    g.deck = shuffle([
      ...TRESORS.map((v) => ({ kind: 'tresor', value: v })),
      ...dangers,
      ...g.dansLePaquet.map((r) => ({ ...r })),
    ]);
    g.path = [];
    g.seen = {};
    g.reveal = null;
    g.ready = [];
    g.roundInfo = null;
    g.step = 'draw';
    for (const e of g.explorers) {
      e.gems = 0;
      e.choice = null;
      e.inside = this.here(e.id);
      e.startTent = e.tent;
    }
    const annonce = g.dansLePaquet.length ? ` Reliques cachées dans le temple : ${g.dansLePaquet.length}.` : '';
    this.addLog(`Manche ${g.round} : tout le monde entre dans le temple.${annonce}`, 'big');
    this.addFx('round-start', { round: g.round });
    // Première carte sans choix ; si c'est un danger, on en retourne une autre.
    if (this.draw() && g.path[0]?.kind === 'danger') this.draw();
    if (g.step !== 'roundEnd') this.openChoices();
  }

  // ── Cartes ───────────────────────────────────────────────────────────────
  /** Révèle une carte pour ceux qui sont dans le temple. Renvoie false si la manche s'arrête. */
  draw() {
    const g = this.g;
    const inside = this.inside();
    if (!inside.length) {
      this.endRound('camp');
      return false;
    }
    if (!g.deck.length) {
      // Ne peut pas arriver avec le vrai paquet (5 dangers × 2 au moins), mais
      // par sécurité : tout le monde rentre sain et sauf.
      this.addLog('Le temple est exploré jusqu’au bout : tout le monde rentre.', 'good');
      this.resolveLeavers(inside.map((e) => e.id));
      this.endRound('fin');
      return false;
    }
    const card = g.deck.pop();
    g.path.push(card);
    const index = g.path.length - 1;
    if (card.kind === 'tresor') {
      const share = Math.floor(card.value / inside.length);
      card.left = card.value - share * inside.length;
      inside.forEach((e) => { e.gems += share; });
      this.addFx('card', { index, card: { ...card }, share });
      this.addLog(`Trésor de ${card.value} : ${share} chacun${card.left ? `, ${card.left} reste${card.left > 1 ? 'nt' : ''} sur le chemin` : ''}.`);
      return true;
    }
    if (card.kind === 'relique') {
      this.addFx('card', { index, card: { ...card } });
      this.addLog(`Une relique : ${card.name} ! Seul celui qui rentre seul pourra l’emporter.`, 'good');
      return true;
    }
    // Danger
    g.seen[card.type] = (g.seen[card.type] || 0) + 1;
    if (g.seen[card.type] >= 2) {
      card.fatal = true;
      g.retires.push(card.type);
      const lost = inside.map((e) => ({ id: e.id, gems: e.gems }));
      inside.forEach((e) => { e.gems = 0; e.inside = false; e.caught = true; });
      this.addFx('card', { index, card: { ...card } });
      this.addFx('flee', { type: card.type, lost });
      this.addLog(`Deuxième ${NOMS[card.type]} ! Tout le monde s’enfuit et perd ses gemmes de la manche.`, 'bad');
      this.endRound('danger', card.type);
      return false;
    }
    this.addFx('card', { index, card: { ...card } });
    this.addLog(`Attention : ${NOMS[card.type]}…`, 'muted');
    return true;
  }

  // ── Choix simultanés ─────────────────────────────────────────────────────
  openChoices() {
    const g = this.g;
    g.step = 'decide';
    for (const e of this.inside()) e.choice = null;
    this.armTimer();
  }

  /** `choice` : 'go' (torche : on continue) ou 'camp' (on rentre). */
  actChoose(pid, { choice } = {}) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'decide') return false;
    const e = this.ex(pid);
    if (!e || !e.inside || !this.here(pid) || !['go', 'camp'].includes(choice)) return false;
    e.choice = choice;
    this.addFx('decided', { pid });
    this.maybeResolve();
    this.changed();
    return true;
  }

  /** Revenir sur son choix tant que tout le monde n'a pas choisi. */
  actUndo(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'decide') return false;
    const e = this.ex(pid);
    if (!e || !e.inside || !e.choice) return false;
    e.choice = null;
    this.changed();
    return true;
  }

  maybeResolve() {
    const inside = this.inside();
    if (inside.every((e) => e.choice)) this.resolveChoices();
    else this.armTimer();
  }

  resolveChoices() {
    const g = this.g;
    this.clearTimer();
    const inside = this.inside();
    const leavers = inside.filter((e) => e.choice === 'camp').map((e) => e.id);
    const stayers = inside.filter((e) => e.choice === 'go').map((e) => e.id);
    g.reveal = { leavers, stayers, gains: {}, reliques: {} };
    this.addFx('reveal', { leavers, stayers });
    if (leavers.length) this.resolveLeavers(leavers);
    else this.addLog('Tout le monde continue…', 'muted');
    inside.forEach((e) => { e.choice = null; });
    if (!stayers.length) {
      this.endRound('camp');
      return;
    }
    g.step = 'reveal';
    // Laisser le temps de voir qui est parti avant la carte suivante.
    this.setTimer(REVEAL_MS, () => {
      if (this.phase !== 'play' || this.g.step !== 'reveal') return;
      if (this.draw()) this.openChoices();
    });
  }

  resolveLeavers(ids) {
    const g = this.g;
    if (!ids.length) return;
    const leaving = ids.map((id) => this.ex(id));
    // Gemmes laissées sur le chemin : partagées, le reste reste sur le chemin.
    const onPath = g.path.reduce((t, c) => t + (c.kind === 'tresor' ? c.left : 0), 0);
    const share = Math.floor(onPath / leaving.length);
    const rest = onPath - share * leaving.length;
    if (onPath) {
      g.path.forEach((c) => { if (c.kind === 'tresor') c.left = 0; });
      const last = [...g.path].reverse().find((c) => c.kind === 'tresor');
      if (last) last.left = rest;
    }
    // Reliques : seulement si UN SEUL joueur rentre.
    let reliques = [];
    if (leaving.length === 1) {
      reliques = g.path.filter((c) => c.kind === 'relique' && !c.taken);
      reliques.forEach((c) => {
        c.taken = true;
        const value = valeurRelique(g.reliquesSorties++);
        leaving[0].reliques.push({ name: c.name, value });
        g.dansLePaquet = g.dansLePaquet.filter((r) => r.id !== c.id);
        if (g.reveal) g.reveal.reliques[leaving[0].id] = (g.reveal.reliques[leaving[0].id] || 0) + value;
        this.addFx('relique', { pid: leaving[0].id, name: c.name, value });
      });
    }
    for (const e of leaving) {
      e.gems += share;
      if (g.reveal) g.reveal.gains[e.id] = e.gems;
      e.tent += e.gems;
      this.addFx('bank', { pid: e.id, gems: e.gems });
      e.gems = 0;
      e.inside = false;
    }
    const noms = leaving.map((e) => this.nameOf(e.id)).join(', ');
    const bonus = reliques.length ? ` et emporte ${reliques.map((r) => r.name).join(', ')}` : '';
    this.addLog(`${noms} rentre${leaving.length > 1 ? 'nt' : ''} au camp${share ? ` (+${share} ramassé${leaving.length > 1 ? 's chacun' : ''} sur le chemin)` : ''}${bonus}.`, 'good');
  }

  // ── Fin de manche, fin de partie ────────────────────────────────────────
  endRound(reason, danger = null) {
    const g = this.g;
    this.clearTimer();
    // Reliques restées sur le chemin : perdues à jamais.
    const perdues = g.path.filter((c) => c.kind === 'relique' && !c.taken);
    perdues.forEach((c) => { g.dansLePaquet = g.dansLePaquet.filter((r) => r.id !== c.id); });
    if (perdues.length) this.addLog(`${perdues.map((c) => c.name).join(', ')} : perdue${perdues.length > 1 ? 's' : ''} à jamais dans le temple.`, 'bad');
    g.step = 'roundEnd';
    g.roundInfo = {
      reason,
      danger,
      perdues: perdues.map((c) => c.name),
      gains: g.explorers.map((e) => ({ id: e.id, gained: e.tent - e.startTent, caught: !!e.caught })),
    };
    g.explorers.forEach((e) => { e.inside = false; e.caught = false; e.choice = null; });
    g.history.push({ round: g.round, reason, danger, gains: g.roundInfo.gains });
    this.addFx('round-end', { round: g.round, reason, danger });
    if (g.round >= g.rounds) return this.endGame();
    this.addLog(`Fin de la manche ${g.round}.`, 'big');
    this.setTimer(PAUSE_MS, () => this.nextRound());
  }

  score(e) { return e.tent + e.reliques.reduce((t, r) => t + r.value, 0); }

  endGame() {
    const live = this.liveExplorers();
    const best = Math.max(...live.map((e) => this.score(e)));
    let top = live.filter((e) => this.score(e) === best);
    const most = Math.max(...top.map((e) => e.reliques.length));
    top = top.filter((e) => e.reliques.length === most);
    const winners = top.map((e) => e.id);
    this.addLog(`Fin de l’expédition : ${winners.map((id) => this.nameOf(id)).join(' et ')} ${winners.length > 1 ? 'gagnent' : 'gagne'} avec ${best} points.`, 'big');
    this.finish(winners, { reason: 'score', best });
  }

  actReady(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'roundEnd' || !this.here(pid)) return false;
    if (!g.ready.includes(pid)) g.ready.push(pid);
    const waiting = this.liveExplorers().filter((e) => this.player(e.id)?.connected && !g.ready.includes(e.id));
    if (!waiting.length) this.nextRound();
    this.changed();
    return true;
  }

  actForce(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'roundEnd' || pid !== this.hostId) return false;
    this.nextRound();
    this.changed();
    return true;
  }

  nextRound() {
    if (!this.g || this.phase !== 'play' || this.g.step !== 'roundEnd') return;
    this.clearTimer();
    this.startRound();
  }

  // ── Minuterie, absents, départs ──────────────────────────────────────────
  armTimer() {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.step !== 'decide') return;
    this.clearTimer();
    const pending = this.inside().filter((e) => !e.choice);
    if (!pending.length) return;
    const absents = pending.some((e) => !this.player(e.id)?.connected);
    const limit = this.settings.choix * 1000;
    const ms = limit ? (absents ? Math.min(limit, ABSENT_MS) : limit) : absents ? ABSENT_MS : 0;
    if (ms) this.setTimer(ms, () => this.timeUp());
  }

  /** Temps écoulé : un absent rentre au camp (il garde ses gemmes), un présent continue. */
  timeUp() {
    const g = this.g;
    if (!g || g.step !== 'decide') return;
    const limit = this.settings.choix > 0;
    for (const e of this.inside()) {
      if (e.choice) continue;
      const connected = this.player(e.id)?.connected;
      if (!connected) e.choice = 'camp';
      else if (limit) e.choice = 'go';
    }
    this.addLog('Temps écoulé : choix faits d’office.', 'muted');
    this.maybeResolve();
  }

  onConnectionChange() {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    if (g.step === 'decide') this.armTimer();
  }

  onLeave(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    this.addLog(`${this.nameOf(pid)} quitte l’expédition.`, 'bad');
    const e = this.ex(pid);
    if (e) { e.inside = false; e.choice = null; }
    const live = this.liveExplorers();
    if (live.length < 2) {
      this.finish(live.map((x) => x.id), { reason: 'abandon' });
      return;
    }
    if (g.step === 'decide') {
      if (!this.inside().length) this.endRound('camp');
      else this.maybeResolve();
    } else if (g.step === 'roundEnd') {
      const waiting = live.filter((x) => this.player(x.id)?.connected && !g.ready.includes(x.id));
      if (!waiting.length) this.nextRound();
    }
  }

  // ── Vue ──────────────────────────────────────────────────────────────────
  gameView(pid) {
    const g = this.g;
    if (!g) return null;
    const ended = this.phase === 'ended';
    const showTents = this.settings.coffres || ended;
    return {
      round: g.round,
      rounds: g.rounds,
      step: g.step,
      path: g.path.map((c) => ({ ...c })),
      seen: g.seen,
      retires: g.retires,
      deckCount: g.deck.length,
      reliquesCachees: g.dansLePaquet.length,
      reliquesSorties: g.reliquesSorties,
      reliquesAVenir: g.aVenir.length,
      explorers: g.explorers.map((e) => ({
        id: e.id,
        inside: e.inside,
        gems: e.gems,
        // La tente est secrète (règle officielle), sauf la sienne ou si l'hôte l'a permis.
        tent: e.id === pid || showTents ? e.tent : null,
        reliques: e.reliques,
        score: e.id === pid || showTents ? this.score(e) : null,
        decided: !!e.choice,
        choice: e.id === pid ? e.choice : null,
      })),
      reveal: g.reveal,
      roundInfo: g.roundInfo,
      // Les gains d'une manche sont publics (les gemmes restent à côté de la
      // tente jusqu'au retour au camp) ; seul le total de la tente est secret.
      history: g.history,
      ready: g.ready,
    };
  }
}

const NOMS = { serpent: 'serpents', araignee: 'araignées', momie: 'momies', feu: 'flammes', eboulement: 'éboulement' };

module.exports = {
  id: 'incan',
  createRoom: (code, opts) => new IncanRoom(code, opts),
  events: {
    'game:choose': 'actChoose',
    'game:undo': 'actUndo',
    'game:ready': 'actReady',
    'game:force': 'actForce',
  },
  IncanRoom,
  TRESORS,
  DANGERS,
  validateSettings,
  valeurRelique,
};
