'use strict';
// salle.js — Classe de base d'une salle de jeu.
//
// Tout ce qui est commun aux jeux (joueurs, hôte, réglages, salon, revanche,
// journal, effets, minuterie, vue de base) vit ici. Un jeu hérite de `Salle`
// et fournit :
//   - validateSettings(s) → { settings } | { error }
//   - onStart()           : met la partie en place (après les contrôles)
//   - onReset()           : remet l'état de partie à zéro (retour au salon)
//   - gameView(pid)       : ce que ce joueur voit de la partie
//   - onLeave(pid)        : un joueur quitte EN PARTIE (par défaut : rien)
//   - onConnectionChange(pid) : un joueur se (dé)connecte en partie
// et ses propres méthodes d'action, déclarées dans `events` du module.
const { realClock, cleanName } = require('./outils');

const LOG_MAX = 60;
const FX_MAX = 16;
const CHAT_MAX = 40;
const CHAT_GAP_MS = 600; // anti-inondation : un message toutes les 0,6 s par joueur

class Salle {
  constructor(code, { clock = realClock, onChange = () => {}, minPlayers = 2, maxPlayers = 8, defaultSettings = {} } = {}) {
    this.code = code;
    this.clock = clock;
    this.onChange = onChange;
    this.minPlayers = minPlayers;
    this.maxPlayers = maxPlayers;
    this.players = [];
    this.hostId = null;
    this.settings = { ...defaultSettings };
    this.started = false;
    this.phase = 'lobby';
    this.log = [];
    this.fx = [];
    this.fxSeq = 0;
    this.timer = null;
    this.timerInfo = null; // { deadline, duration } exposé aux clients
    this.touchedAt = this.clock.now();
    this.lastWinnerIds = [];
    this.chatLog = [];
    this.chatSeq = 0;
  }

  // ── Joueurs ──────────────────────────────────────────────────────────────
  player(id) { return this.players.find((p) => p.id === id); }

  addPlayer(id, name, socketId) {
    if (this.started) return 'La partie a déjà commencé.';
    if (this.players.length >= this.maxPlayers) return `La salle est pleine (${this.maxPlayers} max).`;
    let n = cleanName(name);
    // Deux joueurs du même nom rendraient la table illisible.
    const base = n;
    let k = 2;
    while (this.players.some((p) => p.name === n)) n = `${base.slice(0, 17)} ${k++}`;
    this.players.push({ id, name: n, socketId, connected: true });
    if (!this.hostId) this.hostId = id;
    this.changed();
    return null;
  }

  removePlayer(id) {
    const p = this.player(id);
    if (!p) return;
    if (this.started) {
      p.left = true;
      p.connected = false;
      this.onLeave(id);
    } else {
      this.players = this.players.filter((x) => x.id !== id);
    }
    if (this.hostId === id) {
      const next = this.players.find((x) => !x.left && x.id !== id);
      this.hostId = next ? next.id : this.players[0]?.id || null;
    }
    this.changed();
  }

  reconnect(id, socketId) {
    const p = this.player(id);
    if (!p || p.left) return false;
    p.socketId = socketId;
    p.connected = true;
    if (this.started) this.onConnectionChange(id);
    this.changed();
    return true;
  }

  disconnect(id, socketId) {
    const p = this.player(id);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    if (this.started) this.onConnectionChange(id);
    this.changed();
  }

  activePlayers() { return this.players.filter((p) => !p.left); }

  // ── Réglages, départ, revanche ───────────────────────────────────────────
  setSettings(pid, s) {
    if (pid !== this.hostId || this.started) return 'Seul l’hôte peut modifier les réglages.';
    const { settings, error } = this.validateSettings({ ...this.settings, ...(s || {}) });
    if (error) return error;
    this.settings = settings;
    this.changed();
    return null;
  }

  start(pid) {
    if (pid !== this.hostId) return 'Seul l’hôte peut lancer la partie.';
    if (this.started) return 'La partie a déjà commencé.';
    const n = this.activePlayers().length;
    if (n < this.minPlayers) return `Il faut au moins ${this.minPlayers} joueurs.`;
    if (n > this.maxPlayers) return `${this.maxPlayers} joueurs au maximum.`;
    const { error } = this.validateSettings(this.settings);
    if (error) return error;
    this.started = true;
    this.phase = 'play';
    this.log = [];
    this.fx = [];
    const err = this.onStart();
    if (err) {
      this.started = false;
      this.phase = 'lobby';
      return err;
    }
    this.changed();
    return null;
  }

  backToLobby(pid) {
    if (pid !== this.hostId) return 'Seul l’hôte peut relancer.';
    this.clearTimer();
    this.started = false;
    this.phase = 'lobby';
    this.log = [];
    this.fx = [];
    // Ceux qui ont quitté la partie ne reviennent pas au salon.
    this.players = this.players.filter((p) => !p.left);
    if (!this.player(this.hostId)) this.hostId = this.players[0]?.id || null;
    this.onReset();
    this.changed();
    return null;
  }

  /** Fin de partie : `winnerIds` peut contenir plusieurs gagnants (équipes, égalités). */
  finish(winnerIds, summary = null) {
    this.clearTimer();
    this.phase = 'ended';
    this.winnerIds = winnerIds;
    this.lastWinnerIds = winnerIds;
    this.summary = summary;
    this.addFx('win', { playerIds: winnerIds });
  }

  // ── Discussion ───────────────────────────────────────────────────────────
  chat(pid, payload) {
    const p = this.player(pid);
    if (!p || p.left) return false;
    const raw = typeof payload === 'string' ? payload : payload && payload.text;
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) return false;
    const now = this.clock.now();
    if (p.lastChat !== undefined && now - p.lastChat < CHAT_GAP_MS) return false;
    p.lastChat = now;
    this.chatLog.push({ id: ++this.chatSeq, pid, name: p.name, text, at: now });
    if (this.chatLog.length > CHAT_MAX) this.chatLog.shift();
    this.changed();
    return true;
  }

  // ── Journal, effets, minuterie ───────────────────────────────────────────
  addLog(msg, k = 'info') {
    this.log.unshift({ k, msg });
    if (this.log.length > LOG_MAX) this.log.length = LOG_MAX;
  }

  addFx(type, data = {}) {
    this.fx.push({ id: ++this.fxSeq, type, ...data });
    if (this.fx.length > FX_MAX) this.fx.shift();
  }

  setTimer(ms, fn) {
    this.clearTimer();
    const now = this.clock.now();
    this.timerInfo = { deadline: now + ms, duration: ms };
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.timerInfo = null;
      fn();
      this.changed();
    }, ms);
  }

  clearTimer() {
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.timerInfo = null;
  }

  changed() {
    this.touchedAt = this.clock.now();
    this.onChange(this);
  }

  // ── Vue ──────────────────────────────────────────────────────────────────
  viewFor(pid) {
    return {
      code: this.code,
      hostId: this.hostId,
      started: this.started,
      phase: this.phase,
      settings: this.settings,
      me: pid,
      players: this.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected, left: !!p.left })),
      winnerIds: this.phase === 'ended' ? this.winnerIds : null,
      summary: this.phase === 'ended' ? this.summary : null,
      log: this.log.slice(0, 40),
      chat: this.chatLog,
      fx: this.fx,
      timer: this.timerInfo,
      now: this.clock.now(),
      game: this.started ? this.gameView(pid) : null,
    };
  }

  // ── À fournir par chaque jeu ─────────────────────────────────────────────
  validateSettings(s) { return { settings: s }; }
  onStart() { return null; }
  onReset() {}
  gameView() { return null; }
  onLeave() {}
  onConnectionChange() {}
}

module.exports = { Salle };
