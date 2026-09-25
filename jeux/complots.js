'use strict';
// complots.js — Moteur de règles de Complots (Rikki Tahta, éd. Ferti) :
// Complots, Complots 2 et Complots Deluxe, extensions Saint-Barthélemy et
// Tyrannie (La Peste, Le Mendiant), d'après les livrets officiels. Les rares
// points d'interprétation sont signalés par « INTERPRÉTATION » dans le code.
//
// Le déroulement d'un tour est une PILE DE DÉCISIONS : chaque question posée
// aux joueurs (« quelqu'un met en doute ? », « quelle carte perds-tu ? »…)
// est un cadre empilé, avec sa minuterie et sa suite. Les situations
// imbriquées (un défi pendant un contre pendant une action…) se résolvent
// naturellement, du haut vers le bas.
//
// Branché sur le serveur commun par lib/salles.js (espace /complots).

// ── Constantes ───────────────────────────────────────────────────────────────
const TOTAL_GOLD = 54;              // matériel officiel : 54 Or au total
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const ACTION_TIMEOUT_MS = 120000;   // joueur absent : action par défaut au bout de 2 min
const MIN_DECISION_MS = 20000;      // choix personnels (carte à perdre, échange…)
const DISCONNECTED_DECISION_MS = 12000;
const LOG_MAX = 80;
const FX_MAX = 12;

const CLANS = ['voleurs', 'intouchables', 'negociateurs', 'perceptrices', 'assassins'];

const CHARACTERS = {
  duchesse:       { name: 'La Duchesse',        clan: 'perceptrices', edition: 'complots' },
  assassin:       { name: "L'Assassin",         clan: 'assassins',    edition: 'complots' },
  comtesse:       { name: 'La Comtesse',        clan: 'intouchables', edition: 'complots' },
  capitaine:      { name: 'Le Capitaine',       clan: 'voleurs',      edition: 'complots' },
  ambassadeur:    { name: "L'Ambassadeur",      clan: 'negociateurs', edition: 'complots' },
  inquisiteur:    { name: "L'Inquisiteur",      clan: 'negociateurs', edition: 'complots' },
  illusionniste:  { name: "L'Illusionniste",    clan: 'perceptrices', edition: 'complots2' },
  ursuline:       { name: "L'Ursuline",         clan: 'perceptrices', edition: 'complots2' },
  croquemort:     { name: 'La Croque-Mort',     clan: 'intouchables', edition: 'complots2' },
  sorciere:       { name: 'La Sorcière',        clan: 'intouchables', edition: 'complots2' },
  pape:           { name: 'Le Pape',            clan: 'voleurs',      edition: 'complots2' },
  justicier:      { name: 'Le Justicier',       clan: 'voleurs',      edition: 'complots2' },
  bourreau:       { name: 'Le Bourreau',        clan: 'assassins',    edition: 'complots2' },
  maitrechanteur: { name: 'Le Maître-Chanteur', clan: 'assassins',    edition: 'complots2' },
  espion:         { name: "L'Espion",           clan: 'negociateurs', edition: 'complots2' },
};

const EDITIONS = {
  complots: Object.keys(CHARACTERS).filter((c) => CHARACTERS[c].edition === 'complots'),
  complots2: Object.keys(CHARACTERS).filter((c) => CHARACTERS[c].edition === 'complots2'),
  deluxe: Object.keys(CHARACTERS),
};

// Actions du tour. `claim` : personnage annoncé (donc contestable).
// `counterBy` : 'any' (tout adversaire), 'target' (la cible seule), 'each'
// (chaque adversaire pour lui-même : le Pape). `aggressive` : interdite entre
// joueurs de même religion (Saint-Barthélemy).
const ACTIONS = {
  income:        { cost: 0 },
  foreign_aid:   { counterBy: 'any' },
  coup:          { cost: 7, target: true, aggressive: true },
  tax:           { claim: 'duchesse' },
  assassinate:   { claim: 'assassin', cost: 3, target: true, aggressive: true, counterBy: 'target' },
  steal:         { claim: 'capitaine', target: true, aggressive: true, counterBy: 'target' },
  ambassade:     { claim: 'ambassadeur' },
  inquire_draw:  { claim: 'inquisiteur' },
  inquire_look:  { claim: 'inquisiteur', target: true },
  illusion:      { claim: 'illusionniste', coclaim: true },
  ursuline:      { claim: 'ursuline', target: true },
  pope:          { claim: 'pape', counterBy: 'each' },
  justice:       { claim: 'justicier', target: true, aggressive: true, counterBy: 'target' },
  executioner:   { claim: 'bourreau', cost: 3, target: true, aggressive: true, counterBy: 'target' },
  blackmail:     { claim: 'maitrechanteur', cost: 3, target: true, aggressive: true, counterBy: 'target' },
  spy_draw:      { claim: 'espion' },
  convert_self:  { ext: 'stbarth', cost: 1 },
  convert_other: { ext: 'stbarth', cost: 2, target: true },
  embezzle:      { ext: 'stbarth', claimNot: 'duchesse' },
  peste:         { ext: 'tyrannie', cost: 5, target: true },
  mendiant:      { ext: 'tyrannie', cost: 1, target: true },
};

// Action de chaque personnage (l'Inquisiteur en a deux, au choix).
const CHARACTER_ACTIONS = {
  duchesse: ['tax'], assassin: ['assassinate'], capitaine: ['steal'], ambassadeur: ['ambassade'],
  inquisiteur: ['inquire_draw', 'inquire_look'], illusionniste: ['illusion'], ursuline: ['ursuline'],
  pape: ['pope'], justicier: ['justice'], bourreau: ['executioner'], maitrechanteur: ['blackmail'],
  espion: ['spy_draw'], comtesse: [], croquemort: [], sorciere: [],
};

// Qui contre quoi (livret Deluxe, section « Contrer un Personnage »).
const INTOUCHABLES = ['comtesse', 'sorciere', 'croquemort'];
const CONTRE_VOL = ['capitaine', 'justicier', 'ambassadeur', 'inquisiteur', 'espion'];
const COUNTERS = {
  foreign_aid: ['duchesse', 'ursuline', 'illusionniste'],
  assassinate: INTOUCHABLES,
  executioner: INTOUCHABLES,
  blackmail: INTOUCHABLES,
  steal: CONTRE_VOL,
  justice: CONTRE_VOL,
  pope: ['pape'],
};

const charName = (c) => CHARACTERS[c]?.name || c;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

function defaultSettings() {
  return {
    edition: 'complots',
    preset: 'c1-base',
    roster: ['duchesse', 'assassin', 'comtesse', 'capitaine', 'ambassadeur'],
    stbarth: false,
    tyrannie: false,
    reactionTime: 20,
  };
}

/** Réglages envoyés par l'hôte → réglages valides, ou message d'erreur. */
function validateSettings(s) {
  const edition = EDITIONS[s?.edition] ? s.edition : null;
  if (!edition) return { error: 'Édition inconnue.' };
  const roster = Array.isArray(s.roster) ? [...new Set(s.roster)] : [];
  if (roster.length !== 5) return { error: 'Il faut exactement 5 personnages.' };
  if (roster.some((c) => !EDITIONS[edition].includes(c))) return { error: "Personnage hors de l'édition choisie." };
  const clans = new Set(roster.map((c) => CHARACTERS[c].clan));
  if (clans.size !== 5) return { error: 'Il faut un personnage de chaque clan.' };
  const reactionTime = Math.max(5, Math.min(60, parseInt(s.reactionTime, 10) || 20));
  return {
    settings: {
      edition,
      preset: typeof s.preset === 'string' ? s.preset.slice(0, 30) : 'custom',
      roster,
      stbarth: !!s.stbarth,
      // Tyrannie (La Peste, Le Mendiant) n'existe que dans la boîte Deluxe.
      tyrannie: edition === 'deluxe' && !!s.tyrannie,
      reactionTime,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Moteur
// ═════════════════════════════════════════════════════════════════════════════
class ComplotsRoom {
  constructor(code, opts = {}) {
    this.code = code;
    this.clock = opts.clock || realClock;
    this.onChange = opts.onChange || (() => {});
    this.players = [];
    this.hostId = null;
    this.settings = defaultSettings();
    this.started = false;
    this.phase = 'lobby'; // lobby | play | ended
    this.winnerId = null;
    this.lastWinnerId = null;
    this.court = [];
    this.treasury = 0;
    this.hospice = 0;
    this.currentId = null;
    this.turn = null;
    this.frames = [];
    this.timer = null;
    this.log = [];
    this.fx = [];
    this.fxSeq = 0;
    this.mendiant = null; // { holderId }
    this.peste = null;    // { actorId, targeted: Set }
    this.inExchange = []; // cartes piochées pendant un échange en cours
    this.touchedAt = this.clock.now();
  }

  // ── Joueurs ──────────────────────────────────────────────────────────────
  addPlayer(id, name, socketId) {
    if (this.started) return 'La partie a déjà commencé.';
    if (this.players.length >= MAX_PLAYERS) return `La salle est pleine (${MAX_PLAYERS} max).`;
    this.players.push({
      id, name: String(name || 'Anonyme').slice(0, 20), socketId, connected: true,
      coins: 0, cards: [], eliminated: false, religion: null,
    });
    if (!this.hostId) this.hostId = id;
    this.touch();
    return null;
  }

  player(id) { return this.players.find((p) => p.id === id); }

  reconnect(id, socketId) {
    const p = this.player(id);
    if (!p || p.left) return false;
    p.socketId = socketId;
    p.connected = true;
    if (this.started) this.addLog(`${p.name} est de retour.`, 'info');
    this.changed();
    return true;
  }

  disconnect(id, socketId) {
    const p = this.player(id);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    if (this.started) this.addLog(`${p.name} est hors ligne.`, 'info');
    // Un joueur déconnecté ne bloque pas les fenêtres de réaction.
    if (this.phase === 'play') this.settle();
    else this.changed();
  }
  alive() { return this.players.filter((p) => !p.eliminated); }
  aliveCards(p) { return p.cards.filter((c) => !c.dead); }
  hasAlive(p, char) { return p.cards.some((c) => !c.dead && c.char === char); }
  inRoster(char) { return this.settings.roster.includes(char); }
  touch() { this.touchedAt = this.clock.now(); }

  setSettings(pid, s) {
    if (pid !== this.hostId || this.started) return 'Seul l’hôte peut modifier les réglages.';
    const { settings, error } = validateSettings(s);
    if (error) return error;
    this.settings = settings;
    this.changed();
    return null;
  }

  // ── Journal & effets ─────────────────────────────────────────────────────
  addLog(msg, k = 'info') {
    this.log.unshift({ k, msg });
    if (this.log.length > LOG_MAX) this.log.length = LOG_MAX;
  }
  /** Effet visuel ponctuel (défi, perte de vie, élimination…) pour le client. */
  addFx(type, data = {}) {
    this.fx.push({ id: ++this.fxSeq, type, ...data });
    if (this.fx.length > FX_MAX) this.fx.shift();
  }

  // ── Or ───────────────────────────────────────────────────────────────────
  gain(p, n) {
    const got = Math.max(0, Math.min(n, this.treasury));
    this.treasury -= got;
    p.coins += got;
    if (got) this.addFx('coins', { playerId: p.id, delta: got });
    return got;
  }
  pay(p, n) {
    const paid = Math.max(0, Math.min(n, p.coins));
    p.coins -= paid;
    this.treasury += paid;
    if (paid) this.addFx('coins', { playerId: p.id, delta: -paid });
    return paid;
  }
  transfer(from, to, n) {
    const moved = Math.max(0, Math.min(n, from.coins));
    from.coins -= moved;
    to.coins += moved;
    if (moved) {
      this.addFx('coins', { playerId: from.id, delta: -moved });
      this.addFx('coins', { playerId: to.id, delta: moved });
    }
    return moved;
  }

  // ── Saint-Barthélemy ─────────────────────────────────────────────────────
  reunified() {
    const rel = new Set(this.alive().map((p) => p.religion));
    return rel.size <= 1;
  }
  /** Pacte de non-agression : vrai si `a` ne peut pas viser `b` avec une action agressive. */
  pact(a, b) {
    return this.settings.stbarth && !this.reunified() && a.religion === b.religion;
  }

  // ── Démarrage ────────────────────────────────────────────────────────────
  start(pid) {
    if (pid !== this.hostId) return 'Seul l’hôte peut lancer la partie.';
    if (this.started) return 'La partie a déjà commencé.';
    if (this.players.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs.`;
    const { error } = validateSettings(this.settings);
    if (error) return error;

    // Ordre de jeu : aléatoire, sauf revanche — « le vainqueur de la partie
    // précédente entame la suivante ».
    shuffle(this.players);
    if (this.lastWinnerId) {
      const i = this.players.findIndex((p) => p.id === this.lastWinnerId);
      if (i > 0) this.players = [...this.players.slice(i), ...this.players.slice(0, i)];
    }

    this.started = true;
    this.phase = 'play';
    this.winnerId = null;
    this.log = [];
    this.fx = [];
    this.frames = [];
    this.turn = null;
    this.mendiant = null;
    this.peste = null;
    this.inExchange = [];
    this.hospice = 0;
    this.treasury = TOTAL_GOLD;
    const n = this.players.length;
    this.players.forEach((p) => {
      p.cards = [];
      p.eliminated = false;
      p.coins = 0;
    });
    this.players.forEach((p, i) => {
      // À 2 joueurs, le premier joueur ne reçoit qu'1 Or.
      p.coins = n === 2 && i === 0 ? 1 : 2;
      this.treasury -= p.coins;
    });

    if (this.settings.stbarth) {
      // Le premier joueur choisit sa religion (ici : au hasard), puis chacun
      // prend la face différente du joueur précédent.
      const first = Math.random() < 0.5 ? 'catholique' : 'protestant';
      this.players.forEach((p, i) => {
        p.religion = i % 2 === 0 ? first : first === 'catholique' ? 'protestant' : 'catholique';
      });
    } else {
      this.players.forEach((p) => { p.religion = null; });
    }

    this.addLog('La partie commence. Que le meilleur comploteur l’emporte !', 'start');

    if (n === 2) return this.startTwoPlayerDraft();

    const copies = n >= 7 ? 4 : 3;
    this.court = shuffle(this.settings.roster.flatMap((c) => Array(copies).fill(c)));
    this.players.forEach((p) => {
      p.cards = [{ char: this.court.pop(), dead: false, hidden: false }, { char: this.court.pop(), dead: false, hidden: false }];
    });
    this.startTurn(this.players[0].id);
    this.changed();
    return null;
  }

  /** Partie à 2 : une carte au hasard + une carte choisie parmi sa pile de 5. */
  startTwoPlayerDraft() {
    const roster = this.settings.roster;
    const third = shuffle([...roster]);
    this.players.forEach((p) => {
      p.cards = [{ char: third.pop(), dead: false, hidden: false }];
    });
    this.court = third; // les 3 cartes restantes forment toute la Cour
    this.push({
      kind: 'decide',
      deciders: this.players.map((p) => p.id),
      decided: new Map(),
      timeoutMs: Math.max(MIN_DECISION_MS, this.reaction() * 2),
      describe: () => ({ kind: 'draft' }),
      prompt: () => ({ kind: 'draft', choices: [...roster] }),
      onDecide: (pid, { char }) => {
        if (!roster.includes(char)) return false;
        this.frameTop().decided.set(pid, char);
        return true;
      },
      onComplete: () => {
        const f = this.popTop();
        this.players.forEach((p) => {
          const char = f.decided.get(p.id) || roster[0];
          p.cards.push({ char, dead: false, hidden: false });
        });
        this.addLog('Chacun a choisi son second personnage.', 'info');
        this.startTurn(this.players[0].id);
      },
    });
    this.changed();
    return null;
  }

  reaction() { return this.settings.reactionTime * 1000; }
  decisionMs() { return Math.max(MIN_DECISION_MS, this.reaction()); }

  // ── Pile de décisions ────────────────────────────────────────────────────
  frameTop() { return this.frames[this.frames.length - 1] || null; }

  push(frame) {
    const now = this.clock.now();
    const below = this.frameTop();
    if (below && below.deadline) {
      below.remaining = Math.max(1000, below.deadline - now);
      below.deadline = null;
    }
    frame.passed = frame.passed || new Set();
    this.frames.push(frame);
    this.armTimer();
  }

  popTop() {
    const f = this.frames.pop();
    this.clearTimer();
    return f;
  }

  clearTimer() {
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  armTimer() {
    this.clearTimer();
    const f = this.frameTop();
    if (!f || !f.timeoutMs) return;
    const now = this.clock.now();
    if (!f.deadline) {
      const ms = f.remaining ?? f.timeoutMs;
      f.remaining = null;
      f.deadline = now + ms;
      f.duration = f.duration || f.timeoutMs;
    }
    // Décision attendue d'un joueur déconnecté : inutile de patienter deux
    // minutes, on applique le choix par défaut au bout de quelques secondes.
    if (f.kind === 'decide' && f.deciders.every((id) => !this.player(id)?.connected)) {
      const cap = now + DISCONNECTED_DECISION_MS;
      if (f.deadline > cap) {
        f.deadline = cap;
        f.duration = DISCONNECTED_DECISION_MS;
      }
    }
    this.timer = this.clock.setTimeout(() => this.onTimeout(f), Math.max(0, f.deadline - now));
  }

  onTimeout(f) {
    this.timer = null;
    if (this.phase !== 'play' || this.frameTop() !== f) return;
    if (f.kind === 'respond') {
      this.respondersOf(f).forEach((id) => f.passed.add(id));
    } else if (f.onTimeout) {
      f.onTimeout();
    } else {
      // Choix multiple (brouillon à 2) : on complète avec les défauts.
      f.onComplete();
    }
    this.settle();
  }

  /** Répondants encore en droit d'agir dans un cadre de réaction. */
  respondersOf(f) {
    return f.responders.filter((id) => {
      const p = this.player(id);
      return p && !p.eliminated;
    });
  }

  respondComplete(f) {
    return this.respondersOf(f).every((id) => {
      if (f.passed.has(id)) return true;
      const p = this.player(id);
      // Un joueur déconnecté ne peut pas réagir : on ne le fait pas attendre.
      return p && !p.connected;
    });
  }

  /** Résout tout ce qui peut l'être en haut de la pile, puis diffuse l'état. */
  settle() {
    let guard = 0;
    while (this.phase === 'play' && guard++ < 100) {
      const f = this.frameTop();
      if (!f) break;
      if (f.kind === 'respond' && this.respondComplete(f)) {
        this.popTop();
        f.onDone();
        continue;
      }
      if (f.kind === 'decide' && f.deciders.length > 1 && f.deciders.every((id) => f.decided.has(id))) {
        f.onComplete();
        continue;
      }
      break;
    }
    this.armTimer();
    this.changed();
  }

  changed() {
    this.touch();
    this.onChange(this);
  }

  /** Suite protégée : sans effet si la partie s'est terminée entre-temps. */
  k(fn) {
    return (...args) => {
      if (this.phase !== 'play') return;
      fn(...args);
    };
  }

  // ── Tour ─────────────────────────────────────────────────────────────────
  startTurn(pid) {
    if (this.phase !== 'play') return;
    let p = this.player(pid);
    // Le Mendiant : le joueur qui le détient ne fait aucune action ce tour-ci.
    let guard = 0;
    while (this.mendiant && this.mendiant.holderId === p.id && guard++ < 10) {
      this.addLog(`${p.name} reçoit le Mendiant : il passe son tour et rend la carte.`, 'mendiant');
      this.mendiant = null;
      p = this.nextAlive(p.id);
    }
    this.currentId = p.id;
    this.turn = { actorId: p.id, startCoins: p.coins, act: null };
    this.push({
      kind: 'decide',
      deciders: [p.id],
      decided: new Map(),
      timeoutMs: ACTION_TIMEOUT_MS,
      describe: () => ({ kind: 'choose_action', playerId: p.id }),
      prompt: () => ({ kind: 'action', actions: this.actionOptions(p.id) }),
      onDecide: (_pid, payload) => this.tryDeclare(p.id, payload),
      onTimeout: () => {
        // Joueur absent : Assassinat forcé si obligatoire, sinon Revenu.
        const opts = this.actionOptions(p.id);
        const coup = opts.find((o) => o.id === 'coup' && o.enabled);
        const forced = p.coins >= 10 || this.turn?.startCoins >= 10;
        this.addLog(`${p.name} tarde à jouer : action automatique.`, 'info');
        if (forced && coup) this.tryDeclare(p.id, { action: 'coup', target: coup.targets[0] });
        else this.tryDeclare(p.id, { action: 'income' });
      },
    });
  }

  nextAlive(fromId) {
    const n = this.players.length;
    const i = this.players.findIndex((p) => p.id === fromId);
    for (let s = 1; s <= n; s++) {
      const p = this.players[(i + s) % n];
      if (!p.eliminated) return p;
    }
    return this.player(fromId);
  }

  endTurn() {
    if (this.phase !== 'play') return;
    if (this.checkWin()) return;
    // Filet de sécurité : aucune décision ne doit survivre à la fin d'un tour.
    this.frames = [];
    this.clearTimer();
    this.peste = null;
    this.returnExchange();
    const next = this.nextAlive(this.currentId);
    this.turn = null;
    this.startTurn(next.id);
  }

  checkWin() {
    const alive = this.alive();
    if (alive.length > 1) return false;
    this.finish(alive[0]);
    return true;
  }

  finish(winner) {
    this.phase = 'ended';
    this.frames = [];
    this.clearTimer();
    this.turn = null;
    this.winnerId = winner ? winner.id : null;
    this.lastWinnerId = this.winnerId;
    if (winner) {
      this.addLog(`${winner.name} prend le pouvoir et remporte la partie !`, 'win');
      this.addFx('win', { playerId: winner.id });
    }
    this.changed();
  }

  // ── Actions disponibles ──────────────────────────────────────────────────
  actionOptions(pid) {
    const p = this.player(pid);
    if (!p) return [];
    const forced = (this.turn?.startCoins ?? p.coins) >= 10;
    const opponents = this.alive().filter((o) => o.id !== pid);
    const out = [];
    const add = (id, cond, reason, targets = null) => {
      const A = ACTIONS[id];
      let enabled = cond;
      let why = cond ? null : reason;
      if (forced && id !== 'coup') {
        enabled = false;
        why = 'Assassinat obligatoire (10 Or ou plus)';
      }
      if (enabled && A.target && (!targets || !targets.length)) {
        enabled = false;
        why = why || 'Aucune cible possible';
      }
      out.push({ id, claim: A.claim || null, cost: A.cost || 0, enabled, reason: why, targets: targets ? targets.map((t) => t.id) : null });
    };
    const targetsFor = (id) =>
      opponents.filter((o) => !(ACTIONS[id].aggressive && this.pact(p, o)));

    add('income', true);
    add('foreign_aid', true);
    add('coup', p.coins >= 7, 'Il faut 7 Or', targetsFor('coup'));

    for (const char of this.settings.roster) {
      for (const id of CHARACTER_ACTIONS[char]) {
        switch (id) {
          case 'assassinate':
          case 'executioner':
          case 'blackmail':
            add(id, p.coins >= 3, 'Il faut 3 Or', targetsFor(id));
            break;
          case 'justice': {
            // Le Justicier vole « le joueur le plus riche » (parmi les cibles permises).
            const legal = targetsFor(id);
            const max = Math.max(-1, ...legal.map((o) => o.coins));
            add(id, true, null, legal.filter((o) => o.coins === max));
            break;
          }
          case 'steal':
            add(id, true, null, targetsFor(id));
            break;
          case 'inquire_look':
          case 'ursuline':
            add(id, true, null, opponents);
            break;
          case 'ambassade':
          case 'inquire_draw':
          case 'spy_draw':
            add(id, this.court.length > 0, 'La Cour est vide');
            break;
          default:
            add(id, true);
        }
      }
    }

    if (this.settings.stbarth) {
      const reuni = this.reunified();
      add('convert_self', !reuni && p.coins >= 1, reuni ? 'Réunification : plus de conversion' : 'Il faut 1 Or');
      add('convert_other', !reuni && p.coins >= 2, reuni ? 'Réunification : plus de conversion' : 'Il faut 2 Or', opponents);
      add('embezzle', this.hospice > 0, "L'Hospice est vide");
    }
    if (this.settings.tyrannie) {
      add('peste', p.coins >= 5, 'Il faut 5 Or', opponents);
      add('mendiant', p.coins >= 1 && !this.mendiant, this.mendiant ? 'Le Mendiant est déjà en jeu' : 'Il faut 1 Or', opponents);
    }
    return out;
  }

  tryDeclare(pid, payload) {
    const opts = this.actionOptions(pid);
    const opt = opts.find((o) => o.id === payload?.action);
    if (!opt || !opt.enabled) return false;
    let target = null;
    if (opt.targets) {
      if (!opt.targets.includes(payload.target)) return false;
      target = this.player(payload.target);
    }
    this.popTop(); // le cadre « choisir une action »
    this.declare(pid, payload.action, target);
    return true;
  }

  // ── Déclaration ──────────────────────────────────────────────────────────
  declare(pid, act, target) {
    const a = this.player(pid);
    const t = target;
    const A = ACTIONS[act];
    Object.assign(this.turn, { act, targetId: t ? t.id : null, counter: null, exempt: new Set(), coclaimers: [] });
    this.addFx('declare', { playerId: a.id, act, targetId: t?.id || null, claim: A.claim || null });

    switch (act) {
      case 'income':
        this.gain(a, 1);
        this.addLog(`${a.name} prend 1 Or (Revenu).`, 'coin');
        return this.endTurn();
      case 'coup':
        this.pay(a, 7);
        this.addLog(`${a.name} paie 7 Or et assassine un personnage de ${t.name} !`, 'kill');
        return this.loseLife(t.id, 'coup', this.k(() => this.endTurn()));
      case 'convert_self':
        this.payHospice(a, 1);
        a.religion = a.religion === 'catholique' ? 'protestant' : 'catholique';
        this.addLog(`${a.name} se convertit (${a.religion}) et donne 1 Or à l'Hospice.`, 'religion');
        this.announceReunification();
        return this.endTurn();
      case 'convert_other':
        this.payHospice(a, 2);
        t.religion = t.religion === 'catholique' ? 'protestant' : 'catholique';
        this.addLog(`${a.name} convertit ${t.name} (${t.religion}) et donne 2 Or à l'Hospice.`, 'religion');
        this.announceReunification();
        return this.endTurn();
      case 'mendiant':
        this.pay(a, 1);
        this.mendiant = { holderId: t.id };
        this.addLog(`${a.name} paie 1 Or et envoie le Mendiant à ${t.name} : il passera son prochain tour.`, 'mendiant');
        return this.endTurn();
      case 'peste':
        this.pay(a, 5);
        this.addLog(`${a.name} paie 5 Or et répand la Peste : ${t.name} est frappé !`, 'kill');
        this.peste = { actorId: a.id, targeted: new Set() };
        return this.pesteStrike(t.id);
      default:
        this.addLog(this.declarationText(a, act, t), 'declare');
        return this.openActionWindow(true);
    }
  }

  payHospice(p, n) {
    const paid = Math.min(n, p.coins);
    p.coins -= paid;
    this.hospice += paid;
    if (paid) this.addFx('coins', { playerId: p.id, delta: -paid });
  }

  announceReunification() {
    if (this.settings.stbarth && this.reunified()) {
      this.addLog('Réunification ! Une seule religion subsiste : c’est chacun pour soi.', 'religion');
      this.addFx('reunification');
    }
  }

  declarationText(a, act, t) {
    const tn = t ? t.name : '';
    switch (act) {
      case 'foreign_aid': return `${a.name} demande l'Aide étrangère (+2 Or).`;
      case 'tax': return `${a.name} annonce La Duchesse : +3 Or.`;
      case 'assassinate': return `${a.name} annonce L'Assassin et vise ${tn}.`;
      case 'steal': return `${a.name} annonce Le Capitaine et veut voler 2 Or à ${tn}.`;
      case 'ambassade': return `${a.name} annonce L'Ambassadeur et veut échanger ses cartes.`;
      case 'inquire_draw': return `${a.name} annonce L'Inquisiteur et veut piocher une carte.`;
      case 'inquire_look': return `${a.name} annonce L'Inquisiteur et veut inspecter une carte de ${tn}.`;
      case 'illusion': return `${a.name} annonce L'Illusionniste : +4 Or.`;
      case 'ursuline': return `${a.name} annonce L'Ursuline : +3 Or, dont 1 pour ${tn}.`;
      case 'pope': return `${a.name} annonce Le Pape et prélève 1 Or à chaque adversaire.`;
      case 'justice': return `${a.name} annonce Le Justicier et veut voler 3 Or à ${tn}, le plus riche.`;
      case 'executioner': return `${a.name} annonce Le Bourreau et vise ${tn}.`;
      case 'blackmail': return `${a.name} annonce Le Maître-Chanteur et fait chanter ${tn}.`;
      case 'spy_draw': return `${a.name} annonce L'Espion et veut piocher à la Cour.`;
      case 'embezzle': return `${a.name} jure ne pas avoir La Duchesse et réclame l'or de l'Hospice (${this.hospice} Or).`;
      default: return `${a.name} agit.`;
    }
  }

  // ── Fenêtre de réaction à une action ─────────────────────────────────────
  /**
   * Après l'annonce : les adversaires peuvent mettre en doute (si un
   * personnage est annoncé), contrer (si l'action est contrable et qu'ils en
   * ont le droit), ou laisser faire. `allowChallenge` est faux quand la mise
   * en doute a déjà eu lieu : il ne reste alors que les contres (« on résout
   * toujours la mise en doute avant le contre »).
   */
  openActionWindow(allowChallenge) {
    const t = this.turn;
    const A = ACTIONS[t.act];
    const actor = this.player(t.actorId);
    const canChallenge = allowChallenge && !!(A.claim || A.claimNot);
    const responders = this.alive()
      .filter((o) => o.id !== actor.id)
      .filter((o) => canChallenge || this.counterOptions(o.id).length || this.coclaimAllowed(o.id))
      .map((o) => o.id);
    if (!responders.length) return this.resolveAction();

    this.push({
      kind: 'respond',
      responders,
      timeoutMs: this.reaction(),
      describe: () => ({
        kind: 'action', playerId: actor.id, act: t.act, targetId: t.targetId,
        claim: A.claim || null, claimNot: A.claimNot || null, challengeOpen: canChallenge,
      }),
      options: (pid) => ({
        challenge: canChallenge,
        counters: this.counterOptions(pid),
        coclaim: this.coclaimAllowed(pid) ? 'illusionniste' : null,
      }),
      onChallenge: (pid) => {
        this.popTop();
        const claim = A.claimNot ? { playerId: actor.id, char: A.claimNot, not: true } : { playerId: actor.id, char: A.claim };
        this.challenge(claim, pid, this.k((stands) => {
          if (!stands) {
            // Bluff démasqué : l'action n'a pas lieu et rien n'est payé.
            this.addLog(`L'action de ${actor.name} est annulée.`, 'info');
            return this.endTurn();
          }
          if (this.player(t.actorId).eliminated) return this.endTurn();
          return this.openActionWindow(false);
        }));
      },
      onCounter: (pid, char) => {
        if (t.act === 'pope') return this.popeExemption(pid);
        this.popTop();
        this.counterFlow(pid, char);
      },
      onCoclaim: (pid) => this.illusionCoclaim(pid),
      onDone: () => this.resolveAction(),
    });
  }

  /** Personnages avec lesquels `pid` peut contrer l'action en cours. */
  counterOptions(pid) {
    const t = this.turn;
    if (!t || !t.act) return [];
    const A = ACTIONS[t.act];
    const chars = (COUNTERS[t.act] || []).filter((c) => this.inRoster(c));
    if (!chars.length || pid === t.actorId) return [];
    const actor = this.player(t.actorId);
    const p = this.player(pid);
    if (!p || p.eliminated) return [];
    if (A.counterBy === 'any') {
      // Saint-Barthélemy : pas de contre de l'Aide étrangère entre coreligionnaires.
      if (t.act === 'foreign_aid' && this.pact(p, actor)) return [];
      return chars;
    }
    if (A.counterBy === 'target') return pid === t.targetId ? chars : [];
    if (A.counterBy === 'each') {
      if (t.exempt.has(pid)) return [];
      if (t.act === 'pope' && this.pact(actor, p)) return []; // déjà épargné par le pacte
      return chars;
    }
    return [];
  }

  coclaimAllowed(pid) {
    const t = this.turn;
    return !!(t && ACTIONS[t.act]?.coclaim && pid !== t.actorId && this.inRoster('illusionniste') && !t.coclaimers.includes(pid) && !t.coclaimTried?.has(pid));
  }

  /** Le Pape : un adversaire qui annonce aussi le Pape est épargné. */
  popeExemption(pid) {
    const t = this.turn;
    const f = this.frameTop();
    f.passed.add(pid);
    const p = this.player(pid);
    this.addLog(`${p.name} annonce lui aussi Le Pape pour être épargné.`, 'counter');
    this.claimWindow({ playerId: pid, char: 'pape' }, this.k((stands) => {
      if (stands) t.exempt.add(pid);
    }));
  }

  /** L'Illusionniste : un adversaire qui annonce aussi l'Illusionniste touche 1 Or. */
  illusionCoclaim(pid) {
    const t = this.turn;
    const f = this.frameTop();
    f.passed.add(pid);
    t.coclaimTried = t.coclaimTried || new Set();
    t.coclaimTried.add(pid);
    const p = this.player(pid);
    this.addLog(`${p.name} annonce lui aussi L'Illusionniste.`, 'counter');
    this.claimWindow({ playerId: pid, char: 'illusionniste' }, this.k((stands) => {
      if (stands) t.coclaimers.push(pid);
    }));
  }

  // ── Contre ───────────────────────────────────────────────────────────────
  counterFlow(blockerId, char) {
    const t = this.turn;
    const blocker = this.player(blockerId);
    const actor = this.player(t.actorId);
    t.counter = { playerId: blockerId, char };
    this.addLog(`${blocker.name} contre avec ${charName(char)} !`, 'counter');
    this.addFx('counter', { playerId: blockerId, char });
    // N'importe quel joueur peut mettre en doute un contre ; le joueur actif,
    // lui, peut aussi simplement l'accepter (« se coucher »).
    const responders = this.alive().filter((o) => o.id !== blockerId).map((o) => o.id);
    this.push({
      kind: 'respond',
      responders,
      timeoutMs: this.reaction(),
      describe: () => ({ kind: 'counter', playerId: blockerId, char, actorId: actor.id, act: t.act }),
      options: () => ({ challenge: true, counters: [], coclaim: null }),
      onChallenge: (pid) => {
        this.popTop();
        this.challenge({ playerId: blockerId, char }, pid, this.k((stands) => {
          if (stands) return this.counterStands();
          if (this.player(t.actorId).eliminated) return this.endTurn();
          return this.resolveAction();
        }));
      },
      onDone: () => this.counterStands(),
    });
  }

  /** Contre réussi : l'action échoue, mais les Assassins paient quand même. */
  counterStands() {
    const t = this.turn;
    const actor = this.player(t.actorId);
    const target = t.targetId ? this.player(t.targetId) : null;
    this.addLog(`Le contre tient : l'action de ${actor.name} échoue.`, 'info');
    if (t.act === 'assassinate') this.pay(actor, 3);
    // Bourreau et Maître-Chanteur : les 3 Or vont à la cible (exemple 2 du livret).
    if ((t.act === 'executioner' || t.act === 'blackmail') && target) this.transfer(actor, target, 3);
    this.endTurn();
  }

  // ── Mise en doute ────────────────────────────────────────────────────────
  /**
   * Fenêtre où n'importe quel autre joueur peut mettre en doute l'annonce
   * `claim` ({ playerId, char, not?, cardIndex? }). `done(stands, challenged)`.
   */
  claimWindow(claim, done) {
    const responders = this.alive().filter((o) => o.id !== claim.playerId).map((o) => o.id);
    if (!responders.length) return done(true, false);
    this.push({
      kind: 'respond',
      responders,
      timeoutMs: this.reaction(),
      describe: () => ({ kind: 'claim', playerId: claim.playerId, char: claim.char, not: !!claim.not }),
      options: () => ({ challenge: true, counters: [], coclaim: null }),
      onChallenge: (pid) => {
        this.popTop();
        this.challenge(claim, pid, (stands) => done(stands, true));
      },
      onDone: () => done(true, false),
    });
  }

  /** Résout une mise en doute ; `done(stands)` : l'annonce tient-elle ? */
  challenge(claim, challengerId, done) {
    const p = this.player(claim.playerId);
    const ch = this.player(challengerId);
    const cname = charName(claim.char);
    this.addLog(`${ch.name} met en doute ${p.name} (${claim.not ? 'pas de ' : ''}${cname}).`, 'challenge');

    let truthful;
    if (claim.cardIndex !== undefined) truthful = p.cards[claim.cardIndex]?.char === claim.char;
    else if (claim.not) truthful = !this.hasAlive(p, claim.char);
    else truthful = this.hasAlive(p, claim.char);

    if (truthful) {
      if (claim.cardIndex !== undefined) {
        // La Sorcière annoncée sur une carte perdue : on la dévoile, elle reste morte.
        p.cards[claim.cardIndex].hidden = false;
      } else if (claim.not) {
        // « Abus de confiance » : on prouve l'absence de Duchesse en montrant
        // sa ou ses cartes en vie, qu'on remet à la Cour contre de nouvelles.
        const shown = this.aliveCards(p).map((c) => charName(c.char)).join(' et ');
        this.addLog(`${p.name} montre ${shown} : pas de Duchesse.`, 'proof');
        this.aliveCards(p).forEach((c) => this.court.push(c.char));
        shuffle(this.court);
        this.aliveCards(p).forEach((c) => { c.char = this.court.pop(); });
      } else {
        // La carte montrée retourne à la Cour ; on en pioche une nouvelle.
        const card = p.cards.find((c) => !c.dead && c.char === claim.char);
        this.court.push(card.char);
        shuffle(this.court);
        card.char = this.court.pop();
      }
      this.addLog(`Bonne foi ! ${p.name} avait bien ${claim.not ? 'dit vrai' : cname}. ${ch.name} perd une vie.`, 'proof');
      this.addFx('proof', { playerId: p.id, challengerId: ch.id, char: claim.char });
      return this.loseLife(ch.id, 'challenge', this.k(() => done(true)));
    }

    if (claim.cardIndex !== undefined) p.cards[claim.cardIndex].hidden = false;
    this.addLog(`Menteur ! ${p.name} n'avait pas ${claim.not ? 'dit vrai' : cname}.`, 'bluff');
    this.addFx('bluff', { playerId: p.id, challengerId: ch.id, char: claim.char });
    return this.loseLife(p.id, 'bluff', this.k(() => done(false)));
  }

  // ── Perte de vie ─────────────────────────────────────────────────────────
  /**
   * Le joueur retourne le personnage de son choix. S'il y a une Sorcière dans
   * la partie, il peut annoncer que la carte perdue est la Sorcière : elle
   * reste alors face cachée et lui rapporte 5 Or (annonce contestable).
   */
  loseLife(pid, reason, done) {
    const p = this.player(pid);
    if (!p || p.eliminated || !this.aliveCards(p).length) return done();
    const sorciere = this.inRoster('sorciere');
    this.push({
      kind: 'decide',
      deciders: [pid],
      decided: new Map(),
      timeoutMs: this.decisionMs(),
      describe: () => ({ kind: 'lose_life', playerId: pid, reason }),
      prompt: () => ({
        kind: 'lose_life',
        reason,
        cards: p.cards.map((c, i) => (c.dead ? null : i)).filter((i) => i !== null),
        sorciere,
      }),
      onDecide: (_pid, payload) => {
        const i = payload?.index;
        if (!p.cards[i] || p.cards[i].dead) return false;
        this.popTop();
        this.discardCard(p, i, !!(sorciere && payload.sorciere), done);
        return true;
      },
      onTimeout: () => {
        this.popTop();
        const i = p.cards.findIndex((c) => !c.dead);
        this.discardCard(p, i, false, done);
      },
    });
  }

  discardCard(p, i, claimSorciere, done) {
    const card = p.cards[i];
    card.dead = true;
    if (!claimSorciere) {
      card.hidden = false;
      this.addLog(`${p.name} perd ${charName(card.char)}.`, 'lose');
      this.addFx('lose', { playerId: p.id, char: card.char, index: i });
      return this.afterCardLost(p, done);
    }
    card.hidden = true;
    this.addLog(`${p.name} perd une vie et annonce La Sorcière (la carte reste cachée).`, 'lose');
    this.addFx('lose', { playerId: p.id, char: null, index: i });
    this.claimWindow({ playerId: p.id, char: 'sorciere', cardIndex: i }, this.k((stands) => {
      if (stands) {
        const got = this.gain(p, 5);
        this.addLog(`La Sorcière rapporte ${got} Or à ${p.name}.`, 'coin');
      }
      this.afterCardLost(p, done);
    }));
  }

  afterCardLost(p, done) {
    if (this.aliveCards(p).length) return done();
    return this.eliminate(p, done);
  }

  eliminate(p, done) {
    p.eliminated = true;
    this.addLog(`${p.name} est éliminé.`, 'elim');
    this.addFx('elim', { playerId: p.id });
    if (this.mendiant?.holderId === p.id) this.mendiant = null;
    if (this.checkWin()) return;
    if (p.coins > 0 && this.inRoster('croquemort')) return this.croqueMortWindow(p, done);
    if (p.coins > 0) {
      this.treasury += p.coins;
      this.addLog(`Son or (${p.coins}) retourne au Trésor.`, 'coin');
      p.coins = 0;
    }
    return done();
  }

  /** La Croque-Mort : qui l'annonce récupère l'or du mort (partagé si plusieurs). */
  croqueMortWindow(dead, done) {
    // L'or reste sur le mort jusqu'au partage : ainsi il est toujours compté
    // quelque part (et visible de tous comme « héritage en attente »).
    const coins = dead.coins;
    const claimers = [];
    const tried = new Set();
    const responders = this.alive().map((o) => o.id);
    this.addLog(`L'héritage de ${dead.name} (${coins} Or) attend preneur…`, 'info');
    this.push({
      kind: 'respond',
      responders,
      timeoutMs: this.reaction(),
      describe: () => ({ kind: 'inheritance', playerId: dead.id, coins }),
      options: (pid) => ({ challenge: false, counters: [], coclaim: tried.has(pid) ? null : 'croquemort' }),
      onCoclaim: (pid) => {
        const f = this.frameTop();
        f.passed.add(pid);
        tried.add(pid);
        this.addLog(`${this.player(pid).name} annonce La Croque-Mort.`, 'counter');
        this.claimWindow({ playerId: pid, char: 'croquemort' }, this.k((stands) => {
          if (stands && !this.player(pid).eliminated) claimers.push(pid);
        }));
      },
      onDone: () => {
        dead.coins = 0;
        const heirs = claimers.map((id) => this.player(id)).filter((h) => h && !h.eliminated);
        if (!heirs.length) {
          this.treasury += coins;
          this.addLog(`L'or de ${dead.name} retourne au Trésor.`, 'coin');
        } else {
          const share = Math.floor(coins / heirs.length);
          heirs.forEach((h) => {
            h.coins += share;
            if (share) this.addFx('coins', { playerId: h.id, delta: share });
          });
          this.treasury += coins - share * heirs.length;
          this.addLog(`${heirs.map((h) => h.name).join(', ')} récupère${heirs.length > 1 ? 'nt' : ''} ${share} Or de l'héritage.`, 'coin');
        }
        done();
      },
    });
  }

  // ── Résolution des actions ───────────────────────────────────────────────
  resolveAction() {
    const t = this.turn;
    const a = this.player(t.actorId);
    const target = t.targetId ? this.player(t.targetId) : null;
    if (!a || a.eliminated) return this.endTurn();
    const end = this.k(() => this.endTurn());

    switch (t.act) {
      case 'foreign_aid': {
        const got = this.gain(a, 2);
        this.addLog(`${a.name} reçoit l'Aide étrangère (+${got} Or).`, 'coin');
        return end();
      }
      case 'tax': {
        const got = this.gain(a, 3);
        this.addLog(`${a.name} prélève ${got} Or (La Duchesse).`, 'coin');
        return end();
      }
      case 'illusion': {
        const got = this.gain(a, 4);
        const others = t.coclaimers.map((id) => this.player(id)).filter((o) => o && !o.eliminated);
        if (!others.length) {
          this.addLog(`${a.name} prend ${got} Or (L'Illusionniste).`, 'coin');
          return end();
        }
        // Chaque autre Illusionniste reçoit 1 Or. À partir de 4, le joueur
        // garde 1 Or et distribue les 3 autres. INTERPRÉTATION : faute de
        // choix interactif, les 3 premiers à l'avoir annoncé en profitent.
        const paid = others.length >= 4 ? others.slice(0, 3) : others;
        paid.forEach((o) => this.transfer(a, o, 1));
        this.addLog(`${a.name} prend ${got} Or et en reverse 1 à ${paid.map((o) => o.name).join(', ')}.`, 'coin');
        return end();
      }
      case 'ursuline': {
        const got = this.gain(a, 3);
        let given = 0;
        if (target && !target.eliminated) given = this.transfer(a, target, 1);
        this.addLog(`${a.name} prend ${got} Or (L'Ursuline)${given ? ` et en donne 1 à ${target.name}` : ''}.`, 'coin');
        return end();
      }
      case 'embezzle': {
        const got = this.hospice;
        this.hospice = 0;
        a.coins += got;
        if (got) this.addFx('coins', { playerId: a.id, delta: got });
        this.addLog(`${a.name} vide l'Hospice : +${got} Or.`, 'coin');
        return end();
      }
      case 'steal': {
        if (!target || target.eliminated) return end();
        const n = this.transfer(target, a, 2);
        this.addLog(`${a.name} vole ${n} Or à ${target.name}.`, 'coin');
        return end();
      }
      case 'justice': {
        if (!target || target.eliminated) return end();
        const n = this.transfer(target, a, 3);
        // Garder 1 Or, donner le reste (2 au plus) au joueur le plus pauvre —
        // « cela peut être vous ». INTERPRÉTATION pour les égalités : le
        // Justicier lui-même s'il en fait partie, sinon le premier dans
        // l'ordre du tour.
        const give = Math.max(0, n - 1);
        let msg = `${a.name} vole ${n} Or à ${target.name}`;
        if (give) {
          a.coins -= give; // retiré le temps de trouver le plus pauvre
          const pool = this.alive();
          const min = Math.min(...pool.map((o) => o.coins));
          const poorest = pool.find((o) => o.id === a.id && o.coins === min) || this.orderFrom(a.id).find((o) => o.coins === min);
          poorest.coins += give;
          if (poorest.id !== a.id) {
            this.addFx('coins', { playerId: a.id, delta: -give });
            this.addFx('coins', { playerId: poorest.id, delta: give });
          }
          msg += poorest.id === a.id ? `, et les garde (il est le plus pauvre)` : `, en garde 1 et en donne ${give} à ${poorest.name}, le plus pauvre`;
        }
        this.addLog(msg + '.', 'coin');
        return end();
      }
      case 'pope': {
        const victims = this.alive().filter((o) => o.id !== a.id && !t.exempt.has(o.id) && !this.pact(a, o));
        let total = 0;
        victims.forEach((o) => { total += this.transfer(o, a, 1); });
        this.addLog(`${a.name} prélève 1 Or à chaque adversaire (+${total} Or, Le Pape).`, 'coin');
        return end();
      }
      case 'assassinate':
        if (!target || target.eliminated) return end();
        this.pay(a, 3);
        this.addLog(`L'Assassin frappe ${target.name} !`, 'kill');
        return this.loseLife(target.id, 'assassin', end);
      case 'executioner':
        if (!target || target.eliminated) return end();
        this.transfer(a, target, 3);
        this.addLog(`Le Bourreau paie 3 Or à ${target.name} et l'exécute !`, 'kill');
        return this.loseLife(target.id, 'bourreau', end);
      case 'blackmail':
        if (!target || target.eliminated) return end();
        return this.blackmailChoice(a, target, end);
      case 'ambassade':
        return this.exchange(a, 2, false, end);
      case 'inquire_draw':
        return this.exchange(a, 1, false, end);
      case 'spy_draw':
        return this.exchange(a, 1, true, end);
      case 'inquire_look':
        if (!target || target.eliminated) return end();
        return this.inquisitorLook(a, target, end);
      default:
        return end();
    }
  }

  /** Joueurs vivants dans l'ordre du tour, en partant de `fromId`. */
  orderFrom(fromId) {
    const n = this.players.length;
    const i = this.players.findIndex((p) => p.id === fromId);
    const out = [];
    for (let s = 0; s < n; s++) {
      const p = this.players[(i + s) % n];
      if (!p.eliminated) out.push(p);
    }
    return out;
  }

  blackmailChoice(a, target, end) {
    this.push({
      kind: 'decide',
      deciders: [target.id],
      decided: new Map(),
      timeoutMs: this.decisionMs(),
      describe: () => ({ kind: 'blackmail', playerId: target.id, actorId: a.id }),
      prompt: () => ({ kind: 'blackmail', actorId: a.id, canPay: target.coins >= 3 }),
      onDecide: (_pid, { pay }) => {
        if (pay && target.coins < 3) return false;
        this.popTop();
        if (pay) {
          this.transfer(target, a, 3);
          this.addLog(`${target.name} paie 3 Or à ${a.name} pour sauver sa peau.`, 'coin');
          end();
        } else {
          this.transfer(a, target, 3);
          this.addLog(`${target.name} refuse le chantage : ${a.name} lui paie 3 Or et l'assassine.`, 'kill');
          this.loseLife(target.id, 'maitrechanteur', end);
        }
        return true;
      },
      onTimeout: () => {
        this.popTop();
        this.transfer(a, target, 3);
        this.addLog(`${target.name} ne répond pas : le chantage s'exécute.`, 'kill');
        this.loseLife(target.id, 'maitrechanteur', end);
      },
    });
  }

  /**
   * Échange avec la Cour : `draw` cartes piochées, on garde autant de cartes
   * qu'on a de personnages en vie. L'Espion (`repeatable`) peut recommencer
   * en payant 1 Or par nouvelle carte.
   */
  exchange(a, draw, repeatable, end) {
    const drawn = [];
    for (let i = 0; i < draw && this.court.length; i++) drawn.push(this.court.pop());
    // Cartes piochées « en main » le temps du choix : comptées à part pour
    // que rien ne semble disparaître de la Cour (voir `inExchange`).
    this.inExchange = drawn;
    const alive = a.cards.filter((c) => !c.dead);
    const options = [...alive.map((c) => c.char), ...drawn];
    const keep = alive.length;
    this.push({
      kind: 'decide',
      deciders: [a.id],
      decided: new Map(),
      timeoutMs: this.decisionMs(),
      describe: () => ({ kind: 'exchange', playerId: a.id }),
      prompt: () => ({
        kind: 'exchange', options, keep,
        canRepeat: repeatable && a.coins >= 1 && this.court.length > 0,
      }),
      onDecide: (_pid, payload) => {
        const kept = Array.isArray(payload?.keep) ? [...new Set(payload.keep)] : [];
        if (kept.length !== keep || kept.some((i) => !Number.isInteger(i) || i < 0 || i >= options.length)) return false;
        this.popTop();
        this.applyExchange(a, options, kept);
        this.addLog(`${a.name} a remanié ses cartes.`, 'info');
        if (payload.again && repeatable && a.coins >= 1 && this.court.length) {
          this.pay(a, 1);
          this.addLog(`${a.name} paie 1 Or pour piocher une autre carte (L'Espion).`, 'coin');
          return this.exchange(a, 1, true, end) ?? true;
        }
        end();
        return true;
      },
      onTimeout: () => {
        this.popTop();
        this.applyExchange(a, options, alive.map((_, i) => i));
        end();
      },
    });
  }

  /** Échange interrompu (abandon…) : les cartes piochées retournent à la Cour. */
  returnExchange() {
    if (!this.inExchange.length) return;
    this.court.push(...this.inExchange);
    this.inExchange = [];
    shuffle(this.court);
  }

  applyExchange(a, options, kept) {
    this.inExchange = [];
    const alive = a.cards.filter((c) => !c.dead);
    alive.forEach((c, i) => { c.char = options[kept[i]]; });
    options.forEach((c, i) => { if (!kept.includes(i)) this.court.push(c); });
    shuffle(this.court);
  }

  /** L'Inquisiteur inspecte une carte (choisie par la cible), puis la rend ou la fait défausser. */
  inquisitorLook(a, target, end) {
    this.push({
      kind: 'decide',
      deciders: [target.id],
      decided: new Map(),
      timeoutMs: this.decisionMs(),
      describe: () => ({ kind: 'show_card', playerId: target.id, actorId: a.id }),
      prompt: () => ({ kind: 'show_card', actorId: a.id, cards: target.cards.map((c, i) => (c.dead ? null : i)).filter((i) => i !== null) }),
      onDecide: (_pid, { index }) => {
        if (!target.cards[index] || target.cards[index].dead) return false;
        this.popTop();
        this.inquisitorDecide(a, target, index, end);
        return true;
      },
      onTimeout: () => {
        this.popTop();
        this.inquisitorDecide(a, target, target.cards.findIndex((c) => !c.dead), end);
      },
    });
  }

  inquisitorDecide(a, target, index, end) {
    this.addLog(`${target.name} montre une carte à ${a.name}.`, 'info');
    this.push({
      kind: 'decide',
      deciders: [a.id],
      decided: new Map(),
      timeoutMs: this.decisionMs(),
      describe: () => ({ kind: 'inquisitor', playerId: a.id, targetId: target.id }),
      prompt: () => ({ kind: 'inquisitor', targetId: target.id, seen: target.cards[index].char }),
      onDecide: (_pid, { discard }) => {
        this.popTop();
        if (discard) {
          const card = target.cards[index];
          this.court.push(card.char);
          shuffle(this.court);
          card.char = this.court.pop();
          this.addLog(`${a.name} fait défausser cette carte : ${target.name} en pioche une nouvelle.`, 'info');
        } else {
          this.addLog(`${a.name} rend la carte à ${target.name}.`, 'info');
        }
        end();
        return true;
      },
      onTimeout: () => {
        this.popTop();
        end();
      },
    });
  }

  // ── La Peste (Tyrannie) ──────────────────────────────────────────────────
  /**
   * La cible perd une vie, sauf si elle annonce La Comtesse. Si personne ne
   * la met en doute, elle transmet la Peste à un autre joueur (jamais au
   * joueur actif, et chacun n'est visé qu'une fois). La Peste s'arrête dès
   * qu'un joueur perd une vie, ou quand tout le monde a annoncé la Comtesse.
   */
  pesteStrike(tid) {
    const pz = this.peste;
    const t = this.player(tid);
    pz.targeted.add(tid);
    pz.holderId = tid;
    const canComtesse = this.inRoster('comtesse');
    const endPeste = this.k(() => {
      this.addLog('La Peste retourne au centre de la table.', 'info');
      this.peste = null;
      this.endTurn();
    });
    this.push({
      kind: 'decide',
      deciders: [tid],
      decided: new Map(),
      timeoutMs: this.decisionMs(),
      describe: () => ({ kind: 'peste', playerId: tid }),
      prompt: () => ({ kind: 'peste', canComtesse }),
      onDecide: (_pid, { comtesse }) => {
        this.popTop();
        if (!comtesse || !canComtesse) {
          this.loseLife(tid, 'peste', endPeste);
          return true;
        }
        this.addLog(`${t.name} annonce La Comtesse pour échapper à la Peste.`, 'counter');
        this.claimWindow({ playerId: tid, char: 'comtesse' }, this.k((stands, challenged) => {
          // Mise en doute = quelqu'un a perdu une vie : la Peste s'arrête.
          if (challenged || !stands) return endPeste();
          this.pestePass(tid, endPeste);
        }));
        return true;
      },
      onTimeout: () => {
        this.popTop();
        this.loseLife(tid, 'peste', endPeste);
      },
    });
  }

  pestePass(holderId, endPeste) {
    const pz = this.peste;
    const holder = this.player(holderId);
    const eligible = this.alive().filter((o) => o.id !== pz.actorId && o.id !== holderId && !pz.targeted.has(o.id));
    if (!eligible.length || holder.eliminated) {
      this.addLog('Tout le monde a échappé à la Peste.', 'info');
      return endPeste();
    }
    this.push({
      kind: 'decide',
      deciders: [holderId],
      decided: new Map(),
      timeoutMs: this.decisionMs(),
      describe: () => ({ kind: 'peste_pass', playerId: holderId }),
      prompt: () => ({ kind: 'peste_pass', targets: eligible.map((o) => o.id) }),
      onDecide: (_pid, { target }) => {
        if (!eligible.some((o) => o.id === target)) return false;
        this.popTop();
        this.addLog(`${holder.name} transmet la Peste à ${this.player(target).name}.`, 'kill');
        this.pesteStrike(target);
        return true;
      },
      onTimeout: () => {
        this.popTop();
        const t = eligible[Math.floor(Math.random() * eligible.length)];
        this.addLog(`${holder.name} transmet la Peste à ${t.name}.`, 'kill');
        this.pesteStrike(t.id);
      },
    });
  }

  // ── Événements joueurs ───────────────────────────────────────────────────
  /** Réponse dans une fenêtre de réaction : pass | challenge | counter | coclaim. */
  respond(pid, payload) {
    const f = this.frameTop();
    if (this.phase !== 'play' || !f || f.kind !== 'respond') return false;
    if (!this.respondersOf(f).includes(pid) || f.passed.has(pid)) return false;
    const opts = f.options(pid);
    switch (payload?.type) {
      case 'pass':
        f.passed.add(pid);
        break;
      case 'challenge':
        if (!opts.challenge) return false;
        f.onChallenge(pid);
        break;
      case 'counter':
        if (!opts.counters.includes(payload.char)) return false;
        f.onCounter(pid, payload.char);
        break;
      case 'coclaim':
        if (!opts.coclaim) return false;
        f.onCoclaim(pid);
        break;
      default:
        return false;
    }
    this.settle();
    return true;
  }

  /** Décision personnelle (action, carte perdue, échange, etc.). */
  decide(pid, payload) {
    const f = this.frameTop();
    if (this.phase !== 'play' || !f || f.kind !== 'decide') return false;
    if (!f.deciders.includes(pid) || f.decided.has(pid)) return false;
    const ok = f.onDecide(pid, payload || {});
    this.settle();
    return !!ok;
  }

  /** Abandon en cours de partie : le joueur est éliminé, cartes révélées. */
  abandon(pid) {
    const p = this.player(pid);
    if (!p || !this.started || this.phase !== 'play' || p.eliminated) return;
    p.cards.forEach((c) => { c.dead = true; c.hidden = false; });
    p.eliminated = true;
    this.treasury += p.coins;
    p.coins = 0;
    if (this.mendiant?.holderId === pid) this.mendiant = null;
    this.addLog(`${p.name} abandonne la partie.`, 'elim');
    this.addFx('elim', { playerId: pid });
    if (this.checkWin()) return;
    const f = this.frameTop();
    const involved = this.turn && (this.turn.actorId === pid || (f && f.kind === 'decide' && f.deciders.includes(pid)));
    if (involved) {
      // Son tour ou sa décision en cours : on referme proprement le tour.
      this.frames = [];
      this.clearTimer();
      this.peste = null;
      this.returnExchange();
      this.endTurn();
      this.changed();
      return;
    }
    this.settle();
  }

  /** Retour au salon pour une revanche, mêmes joueurs. */
  backToLobby(pid) {
    if (pid !== this.hostId) return 'Seul l’hôte peut relancer.';
    this.clearTimer();
    this.started = false;
    this.phase = 'lobby';
    this.frames = [];
    this.turn = null;
    this.court = [];
    this.treasury = 0;
    this.hospice = 0;
    this.currentId = null;
    this.mendiant = null;
    this.peste = null;
    this.log = [];
    this.fx = [];
    this.winnerId = null;
    // Ceux qui ont quitté la partie ne reviennent pas au salon.
    this.players = this.players.filter((p) => !p.left);
    if (!this.player(this.hostId)) this.hostId = this.players[0]?.id || null;
    this.players.forEach((p) => {
      p.cards = [];
      p.coins = 0;
      p.eliminated = false;
      p.religion = null;
    });
    this.changed();
    return null;
  }

  removePlayer(pid) {
    if (this.started) {
      // Parti en pleine partie : éliminé maintenant, retiré au retour au salon.
      const p = this.player(pid);
      if (p) {
        p.left = true;
        p.connected = false;
      }
      return this.abandon(pid);
    }
    this.players = this.players.filter((p) => p.id !== pid);
    if (this.hostId === pid) this.hostId = this.players[0]?.id || null;
    this.changed();
  }

  // ── Vue par joueur ───────────────────────────────────────────────────────
  viewFor(pid) {
    const f = this.frameTop();
    const me = this.player(pid);
    let prompt = null;
    if (f && this.phase === 'play' && me && !me.eliminated) {
      if (f.kind === 'decide' && f.deciders.includes(pid) && !f.decided.has(pid)) prompt = f.prompt(pid);
      else if (f.kind === 'respond' && this.respondersOf(f).includes(pid) && !f.passed.has(pid)) {
        prompt = { kind: 'respond', ...f.options(pid) };
      }
    }
    // Les éliminés gardent la main sur la carte à perdre en cours (dernière vie).
    if (!prompt && f && this.phase === 'play' && me && f.kind === 'decide' && f.deciders.includes(pid) && !f.decided.has(pid)) {
      prompt = f.prompt(pid);
    }
    const t = this.turn;
    return {
      code: this.code,
      hostId: this.hostId,
      started: this.started,
      phase: this.phase,
      settings: this.settings,
      winnerId: this.winnerId,
      treasury: this.treasury,
      hospice: this.hospice,
      court: this.court.length,
      currentId: this.currentId,
      reunified: this.settings.stbarth && this.started ? this.reunified() : false,
      mendiantHolderId: this.mendiant?.holderId || null,
      pesteHolderId: this.peste?.holderId || null,
      turn: t && t.act ? {
        actorId: t.actorId, act: t.act, targetId: t.targetId,
        counter: t.counter || null, exempt: [...(t.exempt || [])], coclaimers: t.coclaimers || [],
      } : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        coins: p.coins,
        eliminated: p.eliminated,
        religion: p.religion,
        cards: p.cards.map((c) => ({
          char: p.id === pid || (c.dead && !c.hidden) ? c.char : null,
          dead: c.dead,
          hidden: c.dead && c.hidden,
        })),
      })),
      stage: f && f.describe ? { ...f.describe(), passed: f.kind === 'respond' ? [...f.passed] : [] } : null,
      prompt,
      timer: f && f.deadline ? { deadline: f.deadline, duration: f.duration || f.timeoutMs } : null,
      now: this.clock.now(), // horloge du serveur : le client en déduit son décalage
      log: this.log.slice(0, 50),
      fx: this.fx,
    };
  }
}

module.exports = {
  id: 'complots',
  createRoom: (code, opts) => new ComplotsRoom(code, opts),
  events: { 'game:decide': 'decide', 'game:respond': 'respond' },
  ComplotsRoom, CHARACTERS, ACTIONS, COUNTERS, EDITIONS, CLANS, validateSettings, TOTAL_GOLD,
};
