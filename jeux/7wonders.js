'use strict';
// 7wonders.js — 7 Wonders (Antoine Bauza), NOUVELLE ÉDITION 2020, 3 à 7 joueurs.
//
// Règle officielle 2020 (PDF « regle.pdf » de jeuxstrategieter.free.fr, lue
// le 2026-09-25) ; cartes : jeux/7wonders-catalogue.js (généré, voir
// outils/catalogue-2020.js). Règles de la boîte :
//   - Chacun reçoit une Merveille (face A ou B) qui produit une ressource.
//   - 3 âges ; à chaque âge, 7 cartes par joueur. À chaque tour, tout le monde
//     choisit EN MÊME TEMPS une carte de sa main et : la construit (en payant
//     ressources et/ou pièces, ou gratuitement par chaînage), OU l'utilise pour
//     construire l'étape suivante de sa Merveille (carte cachée sous la
//     Merveille), OU la défausse pour 3 pièces. Puis les mains tournent : vers
//     la gauche aux âges I et III, vers la droite à l'âge II. La 7e carte est
//     défaussée.
//   - Commerce : on achète à ses deux voisins les ressources de leurs cartes
//     brunes/grises et de leur Merveille (2 pièces l'unité, moins avec les
//     comptoirs et le marché). Les pièces reçues ne servent qu'au tour suivant.
//   - Jamais deux bâtiments identiques dans une même cité.
//   - Fin de chaque âge : conflits avec chaque voisin (victoire 1/3/5 PV,
//     défaite −1).
//   - Fin : militaire + trésor (1 PV / 3 pièces) + Merveille + civil + science
//     (carré de chaque symbole + 7 par série de 3) + commerce + guildes.
//     Égalité : le plus de pièces.
// Pouvoirs 2020 : Babylone Nuit (jouer sa 7e carte), Halicarnasse (construire
// gratuitement une carte de la défausse, en fin de tour), Olympie Jour
// (1re carte de chaque couleur gratuite), Olympie Nuit (1re puis dernière
// carte de chaque âge gratuites). Guilde des décorateurs : 7 PV si la
// Merveille est entièrement construite.
const { Salle } = require('../lib/salle');
const { shuffle } = require('../lib/outils');
const CAT = require('./7wonders-catalogue');
const NOMS = require('./7wonders-noms');

const { AGE1, AGE2, AGE3, GUILDS, WONDERS } = CAT;
const CARD = {};
[...AGE1, ...AGE2, ...AGE3, ...GUILDS].forEach((c) => { CARD[c.name] = c; });
const WONDER = {};
WONDERS.forEach((w) => { WONDER[w.name] = w; });

const TOURS = [0, 60, 90, 120];
const FACES = ['choix', 'A', 'B', 'hasard'];
const ABSENT_MS = 30000;
const MILITAIRE = { 1: 1, 2: 3, 3: 5 };

// ── Ressources ─────────────────────────────────────────────────────────────
const tally = (str) => {
  const t = {};
  for (const ch of str || '') t[ch] = (t[ch] || 0) + 1;
  return t;
};
const isChoice = (s) => typeof s === 'string' && s.includes('/');

function addProduction(prod, res, sellable) {
  if (!res) return;
  if (isChoice(res)) {
    prod.choices.push({ options: res.split('/'), sellable: !!sellable });
    return;
  }
  const t = tally(res);
  for (const k in t) {
    prod.fixed[k] = (prod.fixed[k] || 0) + t[k];
    if (sellable) prod.sellable[k] = (prod.sellable[k] || 0) + t[k];
  }
}

/**
 * Coût minimal en pièces pour réunir `resStr` : production propre gratuite,
 * puis achats aux voisins (brun/gris et Merveille seulement).
 * → { ok, coins, left, right }
 */
function solveCost(resStr, self, left, right, prices) {
  const req = tally(resStr);
  const missing = [];
  for (const k in req) {
    const need = Math.max(0, req[k] - (self.fixed[k] || 0));
    for (let i = 0; i < need; i++) missing.push(k);
  }
  if (!missing.length) return { ok: true, coins: 0, left: 0, right: 0 };
  const slots = [];
  self.choices.forEach((c) => slots.push({ options: c.options, side: null }));
  for (const [prod, side] of [[left, 'LEFT_PLAYER'], [right, 'RIGHT_PLAYER']]) {
    for (const k in prod.sellable) for (let i = 0; i < prod.sellable[k]; i++) slots.push({ options: [k], side });
    prod.choices.forEach((c) => { if (c.sellable) slots.push({ options: c.options, side }); });
  }
  const price = (letter, side) => (side ? prices[letter]?.[side] ?? 2 : 0);
  // Les ressources les plus rares d'abord : l'élagage coupe plus tôt.
  missing.sort((a, b) => slots.filter((s) => s.options.includes(a)).length - slots.filter((s) => s.options.includes(b)).length);
  let best = null;
  const used = new Array(slots.length).fill(false);
  (function search(i, total, l, r) {
    if (best && total >= best.coins) return;
    if (i === missing.length) { best = { ok: true, coins: total, left: l, right: r }; return; }
    const letter = missing[i];
    const tried = new Set();
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (used[s] || !slot.options.includes(letter)) continue;
      // Deux emplacements identiques donnent le même résultat : on n'en essaie qu'un.
      const key = `${slot.side}|${slot.options.join('')}`;
      if (tried.has(key)) continue;
      tried.add(key);
      used[s] = true;
      const c = price(letter, slot.side);
      search(i + 1, total + c, l + (slot.side === 'LEFT_PLAYER' ? c : 0), r + (slot.side === 'RIGHT_PLAYER' ? c : 0));
      used[s] = false;
    }
  })(0, 0, 0, 0);
  return best || { ok: false };
}

function science(counts, jokers) {
  const base = (v) => v.reduce((t, x) => t + x * x, 0) + Math.min(...v) * 7;
  const best = (v, j) => {
    if (!j) return base(v);
    let m = 0;
    for (let i = 0; i < 3; i++) { const w = v.slice(); w[i]++; m = Math.max(m, best(w, j - 1)); }
    return m;
  };
  return best([counts.COMPASS || 0, counts.WHEEL || 0, counts.TABLET || 0], jokers || 0);
}

function validateSettings(s) {
  const tour = Number(s.tour);
  if (!TOURS.includes(tour)) return { error: 'Minuterie invalide.' };
  const faces = FACES.includes(s.faces) ? s.faces : 'choix';
  return { settings: { tour, faces } };
}

class SevenRoom extends Salle {
  constructor(code, opts = {}) {
    super(code, { ...opts, minPlayers: 3, maxPlayers: 7, defaultSettings: { tour: 0, faces: 'choix' } });
    this.g = null;
  }

  validateSettings(s) { return validateSettings(s); }

  // ── Mise en place ────────────────────────────────────────────────────────
  onStart() {
    const ids = shuffle(this.activePlayers().map((p) => p.id));
    const wonders = shuffle(WONDERS.map((w) => w.name));
    this.g = {
      seats: ids.map((id, i) => ({
        id,
        wonder: wonders[i],
        side: null,
        stages: [],
        coins: 3,
        built: [],
        under: 0, // cartes glissées sous la Merveille
        prod: { fixed: {}, choices: [], sellable: {} },
        prices: {},
        sci: { COMPASS: 0, WHEEL: 0, TABLET: 0 },
        jokers: 0,
        shields: 0,
        tokens: [], // jetons militaires : +1/+3/+5 ou −1
        specials: {},
        hand: [],
        action: null,
      })),
      age: 0,
      turn: 0,
      phase: 'sides',
      discard: [],
      queue: [], // pouvoirs à résoudre un par un : { type, id }
      special: null,
      lastHolders: [],
      events: [],
      military: null,
      score: null,
    };
    const f = this.settings.faces;
    if (f !== 'choix') {
      for (const s of this.g.seats) this.setSide(s, f === 'hasard' ? (Math.random() < 0.5 ? 'A' : 'B') : f);
      this.startAge(1);
    } else {
      this.addLog('Chacun découvre sa Merveille et choisit sa face (A ou B).', 'big');
      this.armTimer();
    }
    return null;
  }

  onReset() { this.g = null; }

  seat(id) { return this.g?.seats.find((s) => s.id === id); }
  idx(id) { return this.g.seats.findIndex((s) => s.id === id); }
  leftOf(s) { const n = this.g.seats.length; return this.g.seats[(this.idx(s.id) - 1 + n) % n]; }
  rightOf(s) { const n = this.g.seats.length; return this.g.seats[(this.idx(s.id) + 1) % n]; }
  nameOf(id) { return this.player(id)?.name || '?'; }
  isBot(s) { const p = this.player(s.id); return !p || p.left; }
  stagesOf(s) { return WONDER[s.wonder].sides[s.side].stages; }
  nbStages(s) { return s.stages.filter(Boolean).length; }

  setSide(s, side) {
    const w = WONDER[s.wonder].sides[side];
    s.side = side;
    s.stages = new Array(w.stages.length).fill(false);
    addProduction(s.prod, w.initialResource, true);
  }

  actSide(pid, { side } = {}) {
    const g = this.g;
    const s = this.seat(pid);
    if (!g || g.phase !== 'sides' || !s || s.side || !['A', 'B'].includes(side)) return false;
    this.setSide(s, side);
    this.addFx('side', { pid, side });
    if (g.seats.every((x) => x.side)) this.startAge(1);
    else this.armTimer();
    this.changed();
    return true;
  }

  startAge(age) {
    const g = this.g;
    const n = g.seats.length;
    const src = age === 1 ? AGE1 : age === 2 ? AGE2 : AGE3;
    let deck = [];
    src.forEach((c) => { for (let k = 0; k < (c.counts[n] || 0); k++) deck.push(c.name); });
    if (age === 3) deck.push(...shuffle(GUILDS.map((c) => c.name)).slice(0, n + 2));
    deck = shuffle(deck);
    g.seats.forEach((s, i) => { s.hand = deck.slice(i * 7, i * 7 + 7); s.action = null; });
    g.age = age;
    g.turn = 1;
    g.phase = 'play';
    g.military = null;
    this.addLog(`Âge ${['', 'I', 'II', 'III'][age]} : les cartes passent vers la ${age === 2 ? 'droite' : 'gauche'}.`, 'big');
    this.addFx('age', { age });
    this.botsPlay();
    this.armTimer();
  }

  // ── Coûts ────────────────────────────────────────────────────────────────
  hasBuilt(s, name) { return s.built.includes(name); }

  checkBuild(s, name, free = false) {
    const def = CARD[name];
    if (!def) return { ok: false };
    if (this.hasBuilt(s, name)) return { ok: false, dup: true };
    if (free) return { ok: true, coins: 0, left: 0, right: 0, free: true };
    if ((def.chainParents || []).some((p) => s.built.includes(p))) return { ok: true, coins: 0, left: 0, right: 0, chain: true };
    const gold = def.cost.gold || 0;
    const res = def.cost.res ? solveCost(def.cost.res, s.prod, this.leftOf(s).prod, this.rightOf(s).prod, s.prices) : { ok: true, coins: 0, left: 0, right: 0 };
    if (!res.ok || s.coins < gold + res.coins) return { ok: false };
    return { ok: true, coins: gold + res.coins, left: res.left, right: res.right, bank: gold };
  }

  checkWonder(s) {
    const k = this.nbStages(s);
    const stages = this.stagesOf(s);
    if (k >= stages.length) return { ok: false, done: true };
    const res = solveCost(stages[k].cost, s.prod, this.leftOf(s).prod, this.rightOf(s).prod, s.prices);
    if (!res.ok || s.coins < res.coins) return { ok: false };
    return { ok: true, coins: res.coins, left: res.left, right: res.right, stage: k };
  }

  /** Pourquoi cette carte serait gratuite (pouvoirs d'Olympie), ou null. */
  freeReason(s, name) {
    const def = CARD[name];
    if (!def || this.hasBuilt(s, name)) return null;
    if (s.specials.FIRST_OF_COLOR_FREE && !s.built.some((n) => CARD[n].color === def.color)) return 'couleur';
    if (s.specials.FIRST_OF_AGE_FREE && this.g.turn === 1) return 'debut';
    if (s.specials.LAST_OF_AGE_FREE && this.g.turn === 6) return 'fin';
    return null;
  }

  canFree(s, name) { return !!this.freeReason(s, name); }

  // ── Un tour : choix simultanés ─────────────────────────────────────────
  /** move : { type: 'build'|'free'|'wonder'|'discard', card: nom } */
  actMove(pid, move = {}) {
    const g = this.g;
    const s = this.seat(pid);
    if (!g || this.phase !== 'play' || !s || this.isBot(s)) return false;
    if (g.phase === 'last') return this.actLast(pid, move);
    if (g.phase !== 'play' || s.action) return false;
    if (!this.validMove(s, move)) return false;
    s.action = { type: move.type, card: move.card };
    this.addFx('chosen', { pid });
    this.maybeResolve();
    this.changed();
    return true;
  }

  validMove(s, move) {
    if (!s.hand.includes(move.card)) return false;
    if (move.type === 'discard') return true;
    if (move.type === 'build') return this.checkBuild(s, move.card).ok;
    if (move.type === 'free') return this.canFree(s, move.card) && this.checkBuild(s, move.card, true).ok;
    if (move.type === 'wonder') return this.checkWonder(s).ok;
    return false;
  }

  actCancel(pid) {
    const g = this.g;
    const s = this.seat(pid);
    if (!g || g.phase !== 'play' || !s || !s.action) return false;
    s.action = null;
    this.armTimer();
    this.changed();
    return true;
  }

  botsPlay() {
    for (const s of this.g.seats) {
      if (this.isBot(s) && this.g.phase === 'play' && !s.action && s.hand.length) s.action = { type: 'discard', card: s.hand[0] };
    }
  }

  maybeResolve() {
    const g = this.g;
    if (g.seats.every((s) => s.action)) this.resolveTurn();
    else this.armTimer();
  }

  /** Applique une action (construire / Merveille / défausser) : paiements, effets. */
  apply(s, act, pay) {
    const g = this.g;
    s.hand.splice(s.hand.indexOf(act.card), 1);
    if (act.type === 'discard') {
      s.coins += 3;
      g.discard.push(act.card);
      return { pid: s.id, type: 'discard' };
    }
    if (act.type === 'wonder') {
      const chk = pay;
      this.payNeighbors(s, chk);
      s.stages[chk.stage] = true;
      s.under++;
      const eff = this.stagesOf(s)[chk.stage].effect;
      this.effect(s, eff);
      if (eff.action === 'PLAY_DISCARDED') g.queue.push({ type: 'halicarnasse', id: s.id });
      return { pid: s.id, type: 'wonder', stage: chk.stage };
    }
    // build / free
    if (act.type !== 'free') this.payNeighbors(s, pay);
    s.built.push(act.card);
    this.effect(s, CARD[act.card].effect);
    return { pid: s.id, type: 'build', card: act.card, free: act.type === 'free', chain: !!pay?.chain };
  }

  payNeighbors(s, chk) {
    if (!chk || chk.chain || chk.free) return;
    s.coins -= chk.coins;
    if (chk.left) this.leftOf(s).coins += chk.left;
    if (chk.right) this.rightOf(s).coins += chk.right;
  }

  /** Effets immédiats. Les pièces « par carte » se comptent en fin de tour (constructions simultanées incluses). */
  effect(s, eff) {
    if (!eff) return;
    if (eff.gold) s.coins += eff.gold;
    if (eff.military) s.shields += eff.military;
    if (eff.science) {
      if (eff.science === 'any') s.jokers++;
      else s.sci[eff.science]++;
    }
    if (eff.discount) {
      for (const letter of eff.discount.resourceTypes.split('')) {
        for (const side of eff.discount.providers) {
          s.prices[letter] = s.prices[letter] || {};
          s.prices[letter][side] = eff.discount.discountedPrice ?? 1;
        }
      }
    }
    if (eff.production) addProduction(s.prod, eff.production.resources, !!eff.production.isSellable);
    if (eff.action) s.specials[eff.action] = true;
    if (eff.perBoardElement?.gold) (s.pendingGold = s.pendingGold || []).push(eff.perBoardElement);
  }

  countBoards(s, pbe) {
    let total = 0;
    for (const where of pbe.boards) {
      const t = where === 'SELF' ? s : where === 'LEFT' ? this.leftOf(s) : this.rightOf(s);
      if (pbe.type === 'CARD') total += t.built.filter((n) => (pbe.colors || []).includes(CARD[n].color)).length;
      else if (pbe.type === 'BUILT_WONDER_STAGES') total += this.nbStages(t);
      else if (pbe.type === 'DEFEAT_TOKEN') total += t.tokens.filter((x) => x < 0).length;
    }
    return total;
  }

  settleGold() {
    for (const s of this.g.seats) {
      for (const pbe of s.pendingGold || []) s.coins += this.countBoards(s, pbe) * pbe.gold;
      s.pendingGold = [];
    }
  }

  resolveTurn() {
    const g = this.g;
    this.clearTimer();
    // Coûts calculés AVANT tout paiement : les pièces reçues ce tour-ci ne servent pas.
    const plans = g.seats.map((s) => {
      const a = s.action;
      if (a.type === 'build') return this.checkBuild(s, a.card);
      if (a.type === 'free') return this.checkBuild(s, a.card, true);
      if (a.type === 'wonder') return this.checkWonder(s);
      return null;
    });
    const events = g.seats.map((s, i) => {
      const a = s.action;
      s.action = null;
      if (a.type !== 'discard' && !plans[i]?.ok) return this.apply(s, { type: 'discard', card: a.card }, null); // ne devrait pas arriver
      return this.apply(s, a, plans[i]);
    });
    this.settleGold();
    g.events = events;
    this.addFx('turn', { events });
    events.forEach((e) => {
      if (e.type === 'build') this.addLog(`${this.nameOf(e.pid)} construit ${e.card}${e.chain ? ' (chaînage)' : e.free ? ' (gratuit)' : ''}.`);
      else if (e.type === 'wonder') this.addLog(`${this.nameOf(e.pid)} bâtit l’étape ${e.stage + 1} de sa Merveille.`, 'good');
      else this.addLog(`${this.nameOf(e.pid)} défausse une carte (+3 pièces).`, 'muted');
    });
    this.afterTurn();
  }

  afterTurn() {
    const g = this.g;
    if (g.seats[0].hand.length > 1) {
      // Pouvoirs (Halicarnasse) en fin de tour, puis les mains tournent.
      if (this.nextSpecial()) return;
      return this.passHands();
    }
    // Dernier tour de l'âge : Babylone B peut jouer sa 7e carte.
    const holders = g.seats.filter((s) => s.hand.length === 1 && s.specials.PLAY_LAST_CARD && !this.isBot(s));
    if (holders.length && g.phase !== 'last') {
      g.phase = 'last';
      g.lastHolders = holders.map((s) => s.id);
      holders.forEach((s) => { s.action = null; });
      this.addLog(`${holders.map((s) => this.nameOf(s.id)).join(', ')} peut jouer sa 7e carte (Babylone).`, 'good');
      this.armTimer();
      return;
    }
    this.endAge();
  }

  /** Babylone B : jouer la 7e carte (construire, Merveille, ou défausser). */
  actLast(pid, move) {
    const g = this.g;
    const s = this.seat(pid);
    if (!g.lastHolders.includes(pid) || s.action) return false;
    if (!this.validMove(s, move)) return false;
    s.action = { type: move.type, card: move.card };
    if (g.lastHolders.every((id) => this.seat(id).action)) this.resolveLast();
    else this.armTimer();
    this.changed();
    return true;
  }

  resolveLast() {
    const g = this.g;
    this.clearTimer();
    const list = g.lastHolders.map((id) => this.seat(id));
    const plans = list.map((s) => (s.action.type === 'build' ? this.checkBuild(s, s.action.card) : s.action.type === 'free' ? this.checkBuild(s, s.action.card, true) : s.action.type === 'wonder' ? this.checkWonder(s) : null));
    const events = list.map((s, i) => { const a = s.action; s.action = null; return this.apply(s, a, plans[i]); });
    this.settleGold();
    g.events = events;
    this.addFx('turn', { events, last: true });
    g.lastHolders = [];
    this.endAge();
  }

  endAge() {
    const g = this.g;
    // Les 7es cartes restantes vont à la défausse (Halicarnasse peut s'en servir).
    for (const s of g.seats) { g.discard.push(...s.hand); s.hand = []; }
    g.phase = 'play';
    if (this.nextSpecial()) return;
    this.war();
  }

  passHands() {
    const g = this.g;
    const n = g.seats.length;
    const hands = g.seats.map((s) => s.hand);
    // Âges I et III : chacun passe sa main à son voisin de gauche.
    g.seats.forEach((s, i) => { s.hand = g.age === 2 ? hands[(i - 1 + n) % n] : hands[(i + 1) % n]; });
    g.turn++;
    g.phase = 'play';
    this.botsPlay();
    this.armTimer();
  }

  // ── Pouvoirs à résoudre un par un ───────────────────────────────────────
  nextSpecial() {
    const g = this.g;
    while (g.queue.length) {
      const sp = g.queue.shift();
      const s = this.seat(sp.id);
      if (sp.type === 'halicarnasse') {
        const options = [...new Set(g.discard)].filter((n) => !this.hasBuilt(s, n));
        if (!options.length || this.isBot(s)) {
          if (!options.length) this.addLog(`${this.nameOf(s.id)} (Halicarnasse) ne trouve rien à construire dans la défausse.`, 'muted');
          continue;
        }
        g.special = { ...sp, options };
      }
      g.phase = 'special';
      this.armTimer();
      return true;
    }
    g.special = null;
    return false;
  }

  /** Halicarnasse : `card` = nom pris dans la défausse (ou null pour renoncer). */
  actDiscardPick(pid, { card } = {}) {
    const g = this.g;
    if (!g || g.phase !== 'special' || g.special?.type !== 'halicarnasse' || g.special.id !== pid) return false;
    const s = this.seat(pid);
    if (card != null) {
      if (!g.special.options.includes(card)) return false;
      g.discard.splice(g.discard.indexOf(card), 1);
      s.built.push(card);
      this.effect(s, CARD[card].effect);
      this.settleGold();
      this.addFx('halicarnasse', { pid, card });
      this.addLog(`${this.nameOf(pid)} (Halicarnasse) construit ${card} depuis la défausse.`, 'good');
    }
    this.afterSpecial();
    this.changed();
    return true;
  }

  afterSpecial() {
    const g = this.g;
    g.special = null;
    if (this.nextSpecial()) return;
    if (g.seats[0].hand.length > 1) return this.passHands();
    if (g.seats.every((s) => !s.hand.length)) return this.war();
    this.afterTurn();
  }

  // ── Conflits, fin de partie ─────────────────────────────────────────────
  war() {
    const g = this.g;
    const n = g.seats.length;
    const results = [];
    for (let i = 0; i < n; i++) {
      const a = g.seats[i];
      const b = g.seats[(i + 1) % n];
      let winner = null;
      if (a.shields > b.shields) { a.tokens.push(MILITAIRE[g.age]); b.tokens.push(-1); winner = a.id; }
      else if (b.shields > a.shields) { b.tokens.push(MILITAIRE[g.age]); a.tokens.push(-1); winner = b.id; }
      results.push({ a: a.id, b: b.id, sa: a.shields, sb: b.shields, winner });
    }
    g.military = { age: g.age, results };
    this.addFx('war', { age: g.age, results });
    this.addLog(`Conflits de l’âge ${['', 'I', 'II', 'III'][g.age]} résolus.`, 'big');
    if (g.age < 3) return this.startAge(g.age + 1);
    this.finalScore();
  }

  scoreOf(s) {
    const pts = (name) => {
      const eff = CARD[name].effect;
      let t = eff.points || 0;
      if (eff.perBoardElement?.points) t += this.countBoards(s, eff.perBoardElement) * eff.perBoardElement.points;
      // Guilde des décorateurs : 7 PV si toutes les étapes de la Merveille sont construites.
      if (eff.completedWonderPoints && s.stages.every(Boolean)) t += eff.completedWonderPoints;
      return t;
    };
    const byColor = (color) => s.built.filter((n) => CARD[n].color === color);
    const civil = byColor('BLUE').reduce((t, n) => t + pts(n), 0);
    const commerce = byColor('YELLOW').reduce((t, n) => t + pts(n), 0);
    const guildes = byColor('PURPLE').reduce((t, n) => t + pts(n), 0);
    const jokers = s.jokers;
    const merveille = this.stagesOf(s).reduce((t, st, k) => t + (s.stages[k] ? st.effect.points || 0 : 0), 0);
    const militaire = s.tokens.reduce((t, x) => t + x, 0);
    const sciences = science(s.sci, jokers);
    const tresor = Math.floor(s.coins / 3);
    const total = militaire + tresor + merveille + civil + sciences + commerce + guildes;
    return { militaire, tresor, merveille, civil, science: sciences, commerce, guildes, total, coins: s.coins };
  }

  finalScore() {
    const g = this.g;
    g.phase = 'over';
    g.score = Object.fromEntries(g.seats.map((s) => [s.id, this.scoreOf(s)]));
    const humans = g.seats.filter((s) => !this.isBot(s));
    const pool = humans.length ? humans : g.seats;
    const best = Math.max(...pool.map((s) => g.score[s.id].total));
    let top = pool.filter((s) => g.score[s.id].total === best);
    const rich = Math.max(...top.map((s) => s.coins));
    top = top.filter((s) => s.coins === rich);
    const winners = top.map((s) => s.id);
    this.addLog(`Fin de partie : ${winners.map((id) => this.nameOf(id)).join(' et ')} ${winners.length > 1 ? 'gagnent' : 'gagne'} avec ${best} points.`, 'big');
    this.finish(winners, { reason: 'score', best });
  }

  // ── Minuterie, absents, départs ─────────────────────────────────────────
  armTimer() {
    const g = this.g;
    this.clearTimer();
    if (!g || this.phase !== 'play') return;
    const waiting = this.waitingOn();
    if (!waiting.length) return;
    const limit = this.settings.tour * 1000;
    const absent = waiting.some((id) => !this.player(id)?.connected);
    const ms = limit ? (absent ? Math.min(limit, ABSENT_MS) : limit) : absent ? ABSENT_MS : 0;
    if (ms) this.setTimer(ms, () => this.timeUp(!limit));
  }

  waitingOn() {
    const g = this.g;
    if (!g || this.phase !== 'play') return [];
    if (g.phase === 'sides') return g.seats.filter((s) => !s.side).map((s) => s.id);
    if (g.phase === 'play') return g.seats.filter((s) => !s.action).map((s) => s.id);
    if (g.phase === 'last') return g.lastHolders.filter((id) => !this.seat(id).action);
    if (g.phase === 'special') return g.special ? [g.special.id] : [];
    return [];
  }

  /** Temps écoulé (ou absent) : face A, défausse, ou on renonce au pouvoir. */
  timeUp(absentsOnly) {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    const targets = this.waitingOn().filter((id) => !absentsOnly || !this.player(id)?.connected);
    for (const id of targets) {
      const s = this.seat(id);
      if (g.phase === 'sides' && !s.side) { this.setSide(s, 'A'); continue; }
      if ((g.phase === 'play' || g.phase === 'last') && !s.action) s.action = { type: 'discard', card: s.hand[0] };
    }
    if (targets.length) this.addLog(`Temps écoulé : ${targets.map((id) => this.nameOf(id)).join(', ')} ${g.phase === 'sides' ? 'prend la face A' : 'défausse'}.`, 'muted');
    if (g.phase === 'sides') {
      if (g.seats.every((x) => x.side)) this.startAge(1); else this.armTimer();
    } else if (g.phase === 'play') {
      this.maybeResolve();
    } else if (g.phase === 'last') {
      if (g.lastHolders.every((id) => this.seat(id).action)) this.resolveLast(); else this.armTimer();
    } else if (g.phase === 'special' && targets.includes(g.special?.id)) {
      this.actDiscardPick(g.special.id, { card: null });
    }
  }

  onConnectionChange() { if (this.g && this.phase === 'play') this.armTimer(); }

  /** Un joueur qui part laisse un automate à sa place (la table reste un cercle). */
  onLeave(pid) {
    const g = this.g;
    if (!g || this.phase !== 'play') return;
    this.addLog(`${this.nameOf(pid)} quitte la partie : un automate défaussera à sa place.`, 'bad');
    const humans = g.seats.filter((s) => !this.isBot(s));
    if (humans.length < 2) {
      this.finish(humans.map((s) => s.id), { reason: 'abandon' });
      return;
    }
    const s = this.seat(pid);
    if (g.phase === 'sides' && !s.side) this.setSide(s, 'A');
    if (g.phase === 'sides') { if (g.seats.every((x) => x.side)) this.startAge(1); return; }
    if (g.phase === 'play') { if (!s.action && s.hand.length) s.action = { type: 'discard', card: s.hand[0] }; this.maybeResolve(); return; }
    if (g.phase === 'last' && g.lastHolders.includes(pid)) {
      if (!s.action) s.action = { type: 'discard', card: s.hand[0] };
      if (g.lastHolders.every((id) => this.seat(id).action)) this.resolveLast();
      return;
    }
    if (g.phase === 'special' && g.special?.id === pid) this.actDiscardPick(pid, { card: null });
  }

  // ── Vue ──────────────────────────────────────────────────────────────────
  gameView(pid) {
    const g = this.g;
    if (!g) return null;
    const me = this.seat(pid);
    const view = {
      age: g.age,
      turn: g.turn,
      phase: g.phase,
      seats: g.seats.map((s) => ({
        id: s.id,
        wonder: s.wonder,
        side: s.side,
        stages: s.stages,
        coins: s.coins,
        built: s.built,
        prod: { fixed: s.prod.fixed, choices: s.prod.choices.map((c) => ({ options: c.options, sellable: c.sellable })) },
        sci: s.sci,
        jokers: s.jokers,
        shields: s.shields,
        tokens: s.tokens,
        hand: s.hand.length,
        chosen: !!s.action,
        bot: this.isBot(s),
        specials: Object.keys(s.specials),
      })),
      discard: g.discard.length,
      events: g.events,
      military: g.military,
      waiting: this.waitingOn(),
      score: g.score,
      special: g.special ? { type: g.special.type, id: g.special.id, options: g.special.id === pid ? g.special.options : null } : null,
      lastHolders: g.lastHolders,
    };
    if (me) {
      const wonderChk = me.side ? this.checkWonder(me) : { ok: false };
      view.me = {
        wonder: me.wonder,
        side: me.side,
        action: me.action,
        // Pour chaque carte : peut-on la construire, à quel prix, et la Merveille ?
        hand: me.hand.map((name) => {
          const b = this.checkBuild(me, name);
          return {
            name,
            build: b.ok ? { coins: b.coins, left: b.left, right: b.right, chain: !!b.chain } : null,
            dup: !!b.dup,
            free: this.freeReason(me, name),
          };
        }),
        wonder: wonderChk.ok ? { coins: wonderChk.coins, left: wonderChk.left, right: wonderChk.right, stage: wonderChk.stage } : null,
        wonderDone: !!wonderChk.done,
        prices: me.prices,
      };
    }
    return view;
  }
}

module.exports = {
  id: '7wonders',
  createRoom: (code, opts) => new SevenRoom(code, opts),
  events: {
    'game:side': 'actSide',
    'game:move': 'actMove',
    'game:cancel': 'actCancel',
    'game:discard-pick': 'actDiscardPick',
  },
  // Données statiques pour l'affichage (cartes, merveilles) : GET /donnees/7wonders
  donnees: { cards: CARD, wonders: WONDER, noms: NOMS },
  SevenRoom,
  CARD,
  WONDER,
  solveCost,
  science,
  validateSettings,
};
