'use strict';
// traitres.js — Traîtres à bord ! (Savana), 3 à 8 joueurs.
//
// Source : regles-du-jeu.net/regles-traitres-a-bord (texte + PDF, lus le
// 2026-09-25). Une autre page (accessijeux) donne d'autres nombres de
// Planches (12/14/16/18/20/22) : on suit les deux documents concordants.
//   - Rôles secrets : Pirates et Mutins (voir TABLE).
//   - Pioche : 20 × +1, 10 × 0, 12 × −2, les Planches de la table, 3 × Longue-vue,
//     3 × Vide tes poches, 3 × Bon débarras, 3 × Pêche miraculeuse. 3 cartes en main.
//   - À son tour, UNE chose : poser une carte Butin face cachée sur le Coffre en
//     ANNONÇANT sa valeur (mentir est permis), ou jouer une carte Action. Puis
//     piocher (sauf après la Pêche miraculeuse).
//   - Planche devant un autre joueur : à 3, il est poussé à l'eau (rôle révélé,
//     main et planches défaussées).
//   - Au tout début de son tour, un PIRATE (pas un mutin) peut ouvrir le Coffre
//     en révélant son rôle : total ≥ cible → Pirates gagnent, sinon Mutins.
//   - Pirates gagnent aussi si tous les Mutins sont à l'eau ; Mutins gagnent
//     s'ils sont aussi nombreux que les Pirates à bord, ou dès que la pioche est vide.
const { Salle } = require('../lib/salle');
const { shuffle } = require('../lib/outils');

//            joueurs : [mutins, planches, cible du coffre]
const TABLE = { 3: [1, 6, 5], 4: [1, 8, 8], 5: [1, 10, 11], 6: [2, 14, 6], 7: [2, 18, 9], 8: [2, 22, 12] };
const ACTIONS = ['planche', 'longvue', 'debarras', 'vide', 'peche'];
const NOMS = { planche: 'Planche', longvue: 'Longue-vue', debarras: 'Bon débarras', vide: 'Vide tes poches', peche: 'Pêche miraculeuse' };
const TOURS = [0, 45, 90];
const ABSENT_MS = 30000;

function validateSettings(s) {
  const tour = Number(s.tour);
  if (!TOURS.includes(tour)) return { error: 'Minuterie invalide.' };
  return { settings: { tour } };
}

const fmt = (v) => (v > 0 ? `+${v}` : String(v));

class TraitresRoom extends Salle {
  constructor(code, opts = {}) {
    super(code, { ...opts, minPlayers: 3, maxPlayers: 8, defaultSettings: { tour: 0 } });
    this.g = null;
  }

  validateSettings(s) { return validateSettings(s); }

  // ── Mise en place ────────────────────────────────────────────────────────
  onStart() {
    const ids = shuffle(this.activePlayers().map((p) => p.id));
    const [mutins, planches, cible] = TABLE[ids.length];
    const roles = shuffle([...Array(mutins).fill('mutin'), ...Array(ids.length - mutins).fill('pirate')]);
    let seq = 0;
    const cards = [];
    const add = (n, c) => { for (let k = 0; k < n; k++) cards.push({ id: ++seq, ...c }); };
    add(20, { kind: 'butin', v: 1 });
    add(10, { kind: 'butin', v: 0 });
    add(12, { kind: 'butin', v: -2 });
    add(planches, { kind: 'action', a: 'planche' });
    for (const a of ['longvue', 'vide', 'debarras', 'peche']) add(3, { kind: 'action', a });
    const deck = shuffle(cards);
    this.g = {
      seats: ids,
      roles: Object.fromEntries(ids.map((id, i) => [id, roles[i]])),
      hands: Object.fromEntries(ids.map((id) => [id, [deck.pop(), deck.pop(), deck.pop()]])),
      planches: Object.fromEntries(ids.map((id) => [id, 0])),
      out: {},
      deck,
      coffre: [],
      defausse: 0,
      cible,
      mutins,
      cur: ids[0],
      step: 'turn',
      ctx: null,
      annonces: [],
      opened: null,
      turn: 1,
    };
    this.addLog(`${ids.length} marins à bord, dont ${mutins} mutin${mutins > 1 ? 's' : ''}. Objectif du coffre : ${cible}.`, 'big');
    this.addLog(`${this.nameOf(ids[0])} commence.`);
    this.addFx('turn', { pid: ids[0] });
    this.armTimer();
    return null;
  }

  onReset() { this.g = null; }

  nameOf(id) { return this.player(id)?.name || '?'; }
  aboard(id) { return !!this.g && this.g.seats.includes(id) && !this.g.out[id] && !this.player(id)?.left; }
  crew() { return this.g.seats.filter((id) => this.aboard(id)); }
  cardIn(pid, cardId) { return (this.g.hands[pid] || []).find((c) => c.id === cardId); }
  total() { return this.g.coffre.reduce((t, c) => t + c.v, 0); }
  myTurn(pid, step = 'turn') { return !!this.g && this.phase === 'play' && this.g.cur === pid && this.g.step === step; }

  // ── Ouvrir le coffre ────────────────────────────────────────────────────
  actOpen(pid) {
    const g = this.g;
    if (!this.myTurn(pid) || g.roles[pid] !== 'pirate') return false;
    const total = this.total();
    g.opened = { by: pid, total };
    this.addFx('open', { pid, total, cible: g.cible });
    this.addLog(`${this.nameOf(pid)} révèle qu’il/elle est Pirate et ouvre le coffre : ${total} pour ${g.cible} !`, 'big');
    if (total >= g.cible) this.end('pirates', `Le coffre contient ${total} (objectif ${g.cible}).`);
    else this.end('mutins', `Le coffre ne contient que ${total} (objectif ${g.cible}).`);
    this.changed();
    return true;
  }

  // ── Jouer une carte ─────────────────────────────────────────────────────
  /** payload : { card: id, ann?: 1|0|-2 (Butin), target?: pid (Planche, Vide tes poches) } */
  actPlay(pid, { card, ann, target } = {}) {
    const g = this.g;
    if (!this.myTurn(pid)) return false;
    const c = this.cardIn(pid, card);
    if (!c) return false;
    const hand = g.hands[pid];
    if (c.kind === 'butin') {
      const said = ann === undefined ? c.v : Number(ann);
      if (![1, 0, -2].includes(said)) return false;
      hand.splice(hand.indexOf(c), 1);
      g.coffre.push({ ...c, by: pid, ann: said });
      g.annonces.push({ pid, ann: said, turn: g.turn });
      this.addFx('butin', { pid, ann: said });
      this.addLog(`${this.nameOf(pid)} pose une carte dans le coffre : « ${fmt(said)} ».`);
      return this.endTurn(true);
    }
    // Carte Action : vérifier la cible avant de retirer la carte de la main.
    const needsTarget = c.a === 'planche' || c.a === 'vide';
    if (needsTarget && (target === pid || !this.aboard(target))) return false;
    hand.splice(hand.indexOf(c), 1);
    // Une Planche reste posée devant sa cible ; les autres actions vont à la défausse.
    if (c.a !== 'planche') g.defausse++;
    this.addFx('action', { pid, a: c.a, target: needsTarget ? target : null });
    switch (c.a) {
      case 'planche': {
        g.planches[target]++;
        this.addLog(`${this.nameOf(pid)} pose une Planche devant ${this.nameOf(target)} (${g.planches[target]}/3).`, g.planches[target] >= 3 ? 'bad' : 'info');
        if (g.planches[target] >= 3) this.overboard(target);
        if (this.checkCrew()) { this.changed(); return true; }
        return this.endTurn(true);
      }
      case 'debarras': {
        const n = Math.min(2, g.coffre.length);
        g.coffre.splice(g.coffre.length - n, n);
        g.defausse += n;
        this.addLog(`${this.nameOf(pid)} joue Bon débarras : ${n} carte${n > 1 ? 's' : ''} du dessus du coffre à la défausse.`);
        return this.endTurn(true);
      }
      case 'vide': {
        const th = g.hands[target];
        g.defausse += th.length;
        g.hands[target] = [];
        this.draw(target, 3);
        this.addLog(`${this.nameOf(pid)} vide les poches de ${this.nameOf(target)} : main défaussée, 3 nouvelles cartes.`);
        this.addFx('vide', { pid, target });
        if (this.checkDeck()) { this.changed(); return true; }
        return this.endTurn(true);
      }
      case 'longvue': {
        const n = Math.min(3, g.coffre.length);
        if (!n) {
          this.addLog(`${this.nameOf(pid)} joue la Longue-vue… sur un coffre vide.`);
          return this.endTurn(true);
        }
        const top = shuffle(g.coffre.splice(g.coffre.length - n, n));
        g.step = 'longvue';
        g.ctx = { cards: top };
        this.addLog(`${this.nameOf(pid)} regarde les ${n} cartes du dessus du coffre avec la Longue-vue.`);
        this.armTimer();
        this.changed();
        return true;
      }
      case 'peche': {
        const drawn = this.draw(pid, 3);
        g.step = 'peche';
        g.ctx = { drawn: drawn.map((x) => x.id) };
        this.addLog(`${this.nameOf(pid)} joue la Pêche miraculeuse : pioche ${drawn.length}, en remettra 2.`);
        this.armTimer();
        this.changed();
        return true;
      }
      default:
        return false;
    }
  }

  /** Longue-vue : `order` = identifiants des cartes, du DESSUS vers le dessous. */
  actLongvue(pid, { order } = {}) {
    const g = this.g;
    if (!this.myTurn(pid, 'longvue')) return false;
    const cards = g.ctx.cards;
    if (!Array.isArray(order) || order.length !== cards.length || new Set(order).size !== cards.length) return false;
    const byId = new Map(cards.map((c) => [c.id, c]));
    if (!order.every((id) => byId.has(id))) return false;
    // Le dernier poussé est le dessus : on repose du dessous vers le dessus.
    for (let k = order.length - 1; k >= 0; k--) g.coffre.push(byId.get(order[k]));
    g.ctx = null;
    g.step = 'turn';
    this.addLog(`${this.nameOf(pid)} replace les cartes sur le coffre, dans l’ordre de son choix.`);
    return this.endTurn(true);
  }

  /** Pêche miraculeuse : `back` = 2 cartes de sa main à remettre, back[0] sur le dessus. */
  actPeche(pid, { back } = {}) {
    const g = this.g;
    if (!this.myTurn(pid, 'peche')) return false;
    const hand = g.hands[pid];
    const need = Math.min(2, hand.length);
    if (!Array.isArray(back) || back.length !== need || new Set(back).size !== need) return false;
    const cards = back.map((id) => hand.find((c) => c.id === id));
    if (cards.some((c) => !c)) return false;
    cards.forEach((c) => hand.splice(hand.indexOf(c), 1));
    for (let k = cards.length - 1; k >= 0; k--) g.deck.push(cards[k]);
    g.ctx = null;
    g.step = 'turn';
    this.addLog(`${this.nameOf(pid)} remet 2 cartes sur la pioche.`);
    return this.endTurn(false); // on ne pioche pas après la Pêche miraculeuse
  }

  // ── Mécanique ───────────────────────────────────────────────────────────
  draw(pid, n) {
    const g = this.g;
    const got = [];
    for (let k = 0; k < n && g.deck.length; k++) {
      const c = g.deck.pop();
      g.hands[pid].push(c);
      got.push(c);
    }
    return got;
  }

  overboard(id) {
    const g = this.g;
    g.out[id] = true;
    g.defausse += g.hands[id].length + g.planches[id];
    g.hands[id] = [];
    this.addFx('overboard', { pid: id, role: g.roles[id] });
    this.addLog(`💦 ${this.nameOf(id)} est poussé à l’eau… c’était un ${g.roles[id] === 'mutin' ? 'MUTIN' : 'pirate'} !`, g.roles[id] === 'mutin' ? 'good' : 'bad');
  }

  /** Victoire par l'équipage : plus de mutins, ou mutins aussi nombreux que les pirates. */
  checkCrew() {
    const g = this.g;
    const crew = this.crew();
    const m = crew.filter((id) => g.roles[id] === 'mutin').length;
    const p = crew.length - m;
    if (m === 0) { this.end('pirates', 'Tous les mutins sont passés par-dessus bord.'); return true; }
    if (m >= p) { this.end('mutins', 'Les mutins sont aussi nombreux que les pirates à bord.'); return true; }
    return false;
  }

  checkDeck() {
    if (this.g.deck.length) return false;
    this.end('mutins', 'La pioche est vide : le temps a joué pour les mutins.');
    return true;
  }

  endTurn(pioche) {
    const g = this.g;
    if (pioche && this.aboard(g.cur)) this.draw(g.cur, 1);
    g.step = 'turn';
    g.ctx = null;
    if (this.checkDeck()) { this.changed(); return true; }
    // Joueur suivant encore à bord.
    const k = g.seats.indexOf(g.cur);
    for (let n = 1; n <= g.seats.length; n++) {
      const id = g.seats[(k + n) % g.seats.length];
      if (this.aboard(id)) { g.cur = id; break; }
    }
    g.turn++;
    this.addFx('turn', { pid: g.cur });
    this.armTimer();
    this.changed();
    return true;
  }

  end(camp, reason) {
    const g = this.g;
    g.step = 'over';
    g.ctx = null;
    const winners = g.seats.filter((id) => g.roles[id] === (camp === 'pirates' ? 'pirate' : 'mutin'));
    this.addLog(`${camp === 'pirates' ? 'Les Pirates' : 'Les Mutins'} gagnent ! ${reason}`, 'big');
    this.finish(winners, { camp, reason, total: this.total(), cible: g.cible });
  }

  // ── Minuterie, absents, départs ─────────────────────────────────────────
  armTimer() {
    const g = this.g;
    this.clearTimer();
    if (!g || this.phase !== 'play') return;
    const limit = this.settings.tour * 1000;
    const absent = !this.player(g.cur)?.connected;
    const ms = absent ? (limit ? Math.min(limit, ABSENT_MS) : ABSENT_MS) : limit;
    if (ms) this.setTimer(ms, () => this.autoPlay());
  }

  /** Coup joué d'office : Butin annoncé honnêtement de préférence, sinon une action sans risque. */
  autoPlay() {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    const pid = g.cur;
    this.addLog(`${this.nameOf(pid)} tarde : coup joué d’office.`, 'muted');
    if (g.step === 'longvue') return this.actLongvue(pid, { order: g.ctx.cards.map((c) => c.id) });
    if (g.step === 'peche') {
      const drawn = new Set(g.ctx.drawn);
      const hand = g.hands[pid];
      const back = [...hand.filter((c) => drawn.has(c.id)), ...hand.filter((c) => !drawn.has(c.id))].slice(0, Math.min(2, hand.length)).map((c) => c.id);
      return this.actPeche(pid, { back });
    }
    const hand = g.hands[pid];
    const others = this.crew().filter((id) => id !== pid);
    const pick = hand.find((c) => c.kind === 'butin')
      || hand.find((c) => c.a === 'longvue' || c.a === 'peche' || c.a === 'debarras')
      || hand.find((c) => c.a === 'vide')
      || hand.find((c) => c.a === 'planche');
    if (!pick) return this.endTurn(true); // main vide : il ne peut que piocher
    const target = others[Math.floor(Math.random() * others.length)];
    return this.actPlay(pid, { card: pick.id, target });
  }

  onConnectionChange() {
    if (this.g && this.phase === 'play') this.armTimer();
  }

  onLeave(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play' || g.out[pid]) return;
    this.addLog(`${this.nameOf(pid)} quitte le navire.`, 'bad');
    const wasCur = g.cur === pid;
    this.overboard(pid);
    if (this.checkCrew()) return;
    if (wasCur) {
      if (g.step === 'longvue') g.coffre.push(...g.ctx.cards);
      g.step = 'turn';
      g.ctx = null;
      this.endTurn(false);
    }
  }

  // ── Vue ──────────────────────────────────────────────────────────────────
  gameView(pid) {
    const g = this.g;
    if (!g) return null;
    const over = this.phase === 'ended';
    const cur = g.cur === pid;
    return {
      seats: g.seats.map((id) => ({
        id,
        role: id === pid || g.out[id] || over || g.opened?.by === id ? g.roles[id] : null,
        hand: g.hands[id].length,
        planches: g.planches[id],
        out: !!g.out[id],
      })),
      me: g.seats.includes(pid) ? { role: g.roles[pid], hand: g.hands[pid], canOpen: cur && g.step === 'turn' && g.roles[pid] === 'pirate' && !g.out[pid] } : null,
      cur: g.cur,
      step: g.step,
      // Longue-vue et Pêche : le détail n'est montré qu'au joueur actif.
      // (sans dire qui a posé quelle carte du coffre : impossible à savoir à la table).
      ctx: cur && g.ctx
        ? (g.ctx.cards ? { cards: g.ctx.cards.map((c) => ({ id: c.id, kind: c.kind, v: c.v })) } : g.ctx)
        : g.ctx ? { secret: true, count: (g.ctx.cards || g.ctx.drawn || []).length } : null,
      deck: g.deck.length,
      coffre: g.coffre.length,
      defausse: g.defausse,
      cible: g.cible,
      mutins: g.mutins,
      annonces: g.annonces,
      opened: g.opened,
      // À la fin, on retourne le coffre : vraies valeurs, annonces, auteurs.
      coffreFin: over ? g.coffre.map((c) => ({ v: c.v, ann: c.ann, by: c.by })) : null,
      turn: g.turn,
    };
  }
}

module.exports = {
  id: 'traitres',
  createRoom: (code, opts) => new TraitresRoom(code, opts),
  events: {
    'game:open': 'actOpen',
    'game:play': 'actPlay',
    'game:longvue': 'actLongvue',
    'game:peche': 'actPeche',
  },
  TraitresRoom,
  TABLE,
  ACTIONS,
  NOMS,
  validateSettings,
};
