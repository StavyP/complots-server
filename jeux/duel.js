'use strict';
// duel.js — 7 Wonders Duel (Antoine Bauza & Bruno Cathala), 2 joueurs.
//
// Règle officielle française (PDF « regle.pdf » et « aide.pdf » de
// jeuxstrategieter.free.fr/7wonders_duel_complet.php, lus le 2026-09-25).
// Données : jeux/duel-cartes.js.
//   - Mise en place : 7 pièces chacun, pion Conflit au centre, 4 jetons
//     Militaire, 5 jetons Progrès sur le plateau (les 5 autres écartés).
//   - Sélection des Merveilles : 4 révélées, le 1er joueur en prend 1, le 2e
//     en prend 2, le 1er la dernière ; puis 4 autres en commençant par le 2e.
//     (Réglage « découverte » : merveilles imposées de la première partie.)
//   - 3 âges ; chaque âge : 20 cartes en structure (faces visibles et cachées),
//     3 cartes de chaque paquet écartées, 3 guildes au hasard dans l'Âge III.
//   - Tour : prendre une carte ACCESSIBLE (non recouverte) et la construire,
//     OU la défausser pour 2 pièces + 1 par carte jaune, OU la glisser sous
//     une de ses Merveilles pour construire celle-ci. Puis les cartes cachées
//     devenues accessibles sont retournées.
//   - Commerce : chaque ressource manquante coûte, à la banque, 2 + le nombre
//     de cette ressource produite par les cartes brunes et grises ADVERSES
//     (1 avec les dépôts / douanes). Jaunes et Merveilles n'y comptent pas.
//   - Seulement 7 Merveilles en tout : la 8e est retirée.
//   - Boucliers : le pion avance vers la capitale adverse ; entrer dans une
//     zone à jeton fait perdre 2 ou 5 pièces à l'adversaire. Capitale atteinte
//     = victoire militaire immédiate.
//   - Paire de symboles scientifiques identiques = choisir un jeton Progrès ;
//     6 symboles différents = victoire scientifique immédiate.
//   - Fin d'âge : le joueur mené militairement choisit qui commence l'âge
//     suivant (pion au centre : le dernier joueur actif commence).
//   - Fin de l'Âge III : victoire civile aux points (militaire, bâtiments,
//     Merveilles, Progrès, 1 PV par lot de 3 pièces) ; égalité : le plus de
//     points de bâtiments bleus ; sinon victoire partagée.
const { Salle } = require('../lib/salle');
const { shuffle } = require('../lib/outils');
const D = require('./duel-cartes');

const CARTE = {};
D.CARTES.forEach((c) => { CARTE[c.id] = c; });
const MERV = {};
D.MERVEILLES.forEach((w) => { MERV[w.id] = w; });

const TOURS = [0, 60, 90, 120];
const MODES = ['selection', 'decouverte'];
const ABSENT_MS = 60000; // adversaire absent depuis 1 min : on peut réclamer la victoire
const RES = 'WCSGP';
const NOM_RES = D.RESSOURCES;
const AGES = ['', 'I', 'II', 'III'];

const tally = (str) => {
  const t = {};
  for (const ch of str || '') t[ch] = (t[ch] || 0) + 1;
  return t;
};

/**
 * Coût minimal des ressources manquantes.
 * need : chaîne de ressources ; prod : { fixe, choix: [[options]] } ;
 * prix : prix unitaire par ressource ; remise : ressources offertes
 * (Maçonnerie, Architecture — portées sur les plus chères).
 * → { total, achats: { res: nombre } }
 */
function coutRessources(need, prod, prix, remise = 0) {
  const req = tally(need);
  const manque = [];
  for (const k in req) {
    const n = Math.max(0, req[k] - (prod.fixe[k] || 0));
    for (let i = 0; i < n; i++) manque.push(k);
  }
  if (!manque.length) return { total: 0, achats: {} };
  let best = null;
  const essai = (i, reste) => {
    if (i === prod.choix.length || !reste.length) {
      const tri = reste.slice().sort((a, b) => prix[b] - prix[a]);
      const payes = tri.slice(remise);
      const total = payes.reduce((t, r) => t + prix[r], 0);
      if (!best || total < best.total) best = { total, achats: tally(payes.join('')) };
      return;
    }
    essai(i + 1, reste);
    const vus = new Set();
    for (const o of prod.choix[i]) {
      const j = reste.indexOf(o);
      if (j < 0 || vus.has(o)) continue;
      vus.add(o);
      const r2 = reste.slice();
      r2.splice(j, 1);
      essai(i + 1, r2);
    }
  };
  essai(0, manque);
  return best;
}

function validateSettings(s) {
  const tour = Number(s.tour);
  if (!TOURS.includes(tour)) return { error: 'Minuterie invalide.' };
  const merveilles = MODES.includes(s.merveilles) ? s.merveilles : 'selection';
  return { settings: { tour, merveilles } };
}

class DuelRoom extends Salle {
  constructor(code, opts = {}) {
    super(code, { ...opts, minPlayers: 2, maxPlayers: 2, defaultSettings: { tour: 0, merveilles: 'selection' } });
    this.g = null;
  }

  validateSettings(s) { return validateSettings(s); }

  // ── Mise en place ────────────────────────────────────────────────────────
  onStart() {
    // Le siège 0 est le premier joueur (tiré au sort).
    const ids = shuffle(this.activePlayers().map((p) => p.id));
    const progres = shuffle(Object.keys(D.PROGRES));
    this.g = {
      sieges: ids.map((id) => ({ id, pieces: 7, cite: [], merveilles: [], progres: [], sci: {}, absentDepuis: null })),
      etape: 'selection',
      selection: null,
      age: 0,
      cases: [],
      actif: 0,
      pion: 0, // > 0 : vers la capitale du siège 1 (le siège 0 mène)
      jetons: { '0-2': true, '0-5': true, '1-2': true, '1-5': true }, // clé : siège qui perdrait les pièces
      plateau: progres.slice(0, 5),
      boite: progres.slice(5),
      defausse: [],
      decision: null,
      file: [],
      rejouer: false,
      dernierActif: 0,
      choisit: null,
      score: null,
      fin: null,
    };
    if (this.settings.merveilles === 'decouverte') {
      this.g.sieges.forEach((s, i) => { s.merveilles = D.DECOUVERTE[i].map((id) => ({ id, construite: false })); });
      this.addLog('Partie découverte : Merveilles imposées.', 'big');
      this.debutAge(1, 0);
    } else {
      const tas = shuffle(D.MERVEILLES.map((w) => w.id)).slice(0, 8);
      this.g.selection = { manche: 1, offertes: tas.slice(0, 4), reserve: tas.slice(4), ordre: [0, 1, 1, 0], k: 0 };
      this.addLog(`Sélection des Merveilles : ${this.nomSiege(0)} choisit en premier.`, 'big');
      this.armTimer();
    }
    return null;
  }

  onReset() { this.g = null; }

  // ── Outils ───────────────────────────────────────────────────────────────
  indice(pid) { return this.g ? this.g.sieges.findIndex((s) => s.id === pid) : -1; }
  nomSiege(i) { return this.player(this.g.sieges[i].id)?.name || '?'; }
  a(s, progres) { return s.progres.includes(progres); }
  nb(s, couleurs) { return s.cite.filter((id) => couleurs.includes(CARTE[id].couleur)).length; }
  nbMerveilles(s) { return s.merveilles.filter((w) => w.construite).length; }

  production(s) {
    const fixe = {};
    const choix = [];
    for (const id of s.cite) {
      const d = CARTE[id];
      if (d.prod) for (const ch of d.prod) fixe[ch] = (fixe[ch] || 0) + 1;
      if (d.choix) choix.push(d.choix.split(''));
    }
    for (const w of s.merveilles) if (w.construite && MERV[w.id].choix) choix.push(MERV[w.id].choix.split(''));
    return { fixe, choix };
  }

  /** Prix d'achat de chaque ressource pour le siège i. */
  prix(i) {
    const s = this.g.sieges[i];
    const adv = this.production(this.g.sieges[1 - i]).fixe; // brun + gris seulement
    const out = {};
    for (const r of RES) {
      const fixe = s.cite.some((id) => (CARTE[id].commerce || '').includes(r));
      out[r] = fixe ? 1 : 2 + (adv[r] || 0);
    }
    return out;
  }

  aChaine(s, symbole) { return !!symbole && s.cite.some((id) => CARTE[id].chaine === symbole); }

  /** Peut-on construire cette carte, et à quel prix ? */
  checkCarte(i, id) {
    const s = this.g.sieges[i];
    const d = CARTE[id];
    if (this.aChaine(s, d.depuis)) return { ok: true, total: 0, commerce: 0, achats: {}, chaine: true };
    const remise = d.couleur === 'bleu' && this.a(s, 'maconnerie') ? 2 : 0;
    const r = coutRessources(d.cout.res || '', this.production(s), this.prix(i), remise);
    const total = (d.cout.pieces || 0) + r.total;
    return { ok: s.pieces >= total, total, commerce: r.total, achats: r.achats, chaine: false };
  }

  checkMerveille(i, wid) {
    const s = this.g.sieges[i];
    const w = s.merveilles.find((x) => x.id === wid);
    if (!w || w.construite || w.retiree) return { ok: false };
    const remise = this.a(s, 'architecture') ? 2 : 0;
    const r = coutRessources(MERV[wid].cout, this.production(s), this.prix(i), remise);
    return { ok: s.pieces >= r.total, total: r.total, commerce: r.total, achats: r.achats };
  }

  accessible(n) {
    const k = this.g.cases[n];
    if (!k || k.prise) return false;
    return !this.g.cases.some((o) => !o.prise && o.rang === k.rang + 1 && Math.abs(o.x - k.x) === 1);
  }

  /** Paie un coût ; l'argent du commerce va à l'adversaire s'il a l'Économie. */
  payer(i, chk) {
    const s = this.g.sieges[i];
    const adv = this.g.sieges[1 - i];
    s.pieces -= chk.total;
    if (chk.commerce && this.a(adv, 'economie')) {
      adv.pieces += chk.commerce;
      this.addLog(`Économie : ${this.nomSiege(1 - i)} récupère ${chk.commerce} pièce${chk.commerce > 1 ? 's' : ''}.`, 'muted');
    }
  }

  perdre(i, n) {
    const s = this.g.sieges[i];
    const perte = Math.min(n, s.pieces);
    s.pieces -= perte;
    return perte;
  }

  // ── Sélection des Merveilles ─────────────────────────────────────────────
  actSelection(pid, { merveille } = {}) {
    const g = this.g;
    const i = this.indice(pid);
    if (!g || this.phase !== 'play' || g.etape !== 'selection' || i < 0) return false;
    const sel = g.selection;
    if (sel.ordre[sel.k] !== i || !sel.offertes.includes(merveille)) return false;
    this.prendreMerveille(i, merveille);
    this.changed();
    return true;
  }

  prendreMerveille(i, wid) {
    const g = this.g;
    const sel = g.selection;
    sel.offertes.splice(sel.offertes.indexOf(wid), 1);
    g.sieges[i].merveilles.push({ id: wid, construite: false });
    this.addLog(`${this.nomSiege(i)} prend ${MERV[wid].nom}.`);
    this.addFx('merveille-prise', { siege: i, merveille: wid });
    sel.k++;
    if (sel.k === 3) {
      // La dernière revient d'office à l'autre joueur.
      const j = sel.ordre[3];
      const last = sel.offertes.pop();
      g.sieges[j].merveilles.push({ id: last, construite: false });
      this.addLog(`${this.nomSiege(j)} reçoit ${MERV[last].nom}.`);
      sel.k++;
    }
    if (sel.k >= 4) {
      if (sel.manche === 1) {
        g.selection = { manche: 2, offertes: sel.reserve, reserve: [], ordre: [1, 0, 0, 1], k: 0 };
        this.addLog(`Deuxième tirage : ${this.nomSiege(1)} choisit en premier.`, 'big');
      } else {
        g.selection = null;
        this.debutAge(1, 0);
        return;
      }
    }
    this.armTimer();
  }

  // ── Âges ─────────────────────────────────────────────────────────────────
  debutAge(age, premier) {
    const g = this.g;
    let paquet = shuffle(D.CARTES.filter((c) => c.age === age).map((c) => c.id)).slice(3);
    if (age === 3) paquet = shuffle([...paquet, ...shuffle(D.CARTES.filter((c) => c.age === 'G').map((c) => c.id)).slice(0, 3)]);
    const cases = [];
    let k = 0;
    D.STRUCTURES[age].forEach(([xs, visible], rang) => {
      xs.forEach((x) => cases.push({ carte: paquet[k++], rang, x, visible, prise: false }));
    });
    g.cases = cases;
    g.age = age;
    g.actif = premier;
    g.etape = 'jeu';
    g.rejouer = false;
    g.choisit = null;
    this.addLog(`Âge ${AGES[age]} : ${this.nomSiege(premier)} commence.`, 'big');
    this.addFx('age', { age });
    this.armTimer();
  }

  finAge() {
    const g = this.g;
    if (g.rejouer) this.addLog('L’âge se termine : l’effet « Rejouer » est perdu.', 'muted');
    g.rejouer = false;
    if (g.age === 3) return this.finCivile();
    if (g.pion === 0) {
      this.addLog('Pion Conflit au centre : le dernier joueur actif commence.', 'muted');
      this.debutAge(g.age + 1, g.dernierActif);
      return;
    }
    // Le joueur mené militairement (pion de son côté) choisit.
    g.etape = 'debut';
    g.choisit = g.pion > 0 ? 1 : 0;
    this.addLog(`Fin de l’âge ${AGES[g.age]} : ${this.nomSiege(g.choisit)}, mené militairement, choisit qui commence.`, 'big');
    this.armTimer();
  }

  actPremier(pid, { moi } = {}) {
    const g = this.g;
    const i = this.indice(pid);
    if (!g || this.phase !== 'play' || g.etape !== 'debut' || i !== g.choisit) return false;
    const premier = moi === false ? 1 - i : i;
    this.debutAge(g.age + 1, premier);
    this.changed();
    return true;
  }

  // ── Un tour ──────────────────────────────────────────────────────────────
  /** coup : { n: case, type: 'construire'|'defausser'|'merveille', merveille } */
  actCoup(pid, { n, type, merveille } = {}) {
    const g = this.g;
    const i = this.indice(pid);
    if (!g || this.phase !== 'play' || g.etape !== 'jeu' || g.decision || i !== g.actif) return false;
    if (!Number.isInteger(n) || !this.accessible(n) || !g.cases[n].visible) return false;
    const id = g.cases[n].carte;
    const s = g.sieges[i];
    if (type === 'construire') {
      const chk = this.checkCarte(i, id);
      if (!chk.ok) return false;
      this.retirerCase(n);
      this.payer(i, chk);
      this.addLog(`${this.nomSiege(i)} construit ${CARTE[id].nom}${chk.chaine ? ' (chaînage)' : chk.total ? ` (${chk.total} pièce${chk.total > 1 ? 's' : ''})` : ''}.`);
      this.addFx('coup', { siege: i, type, carte: id, n });
      this.construire(i, id, { chaine: chk.chaine });
    } else if (type === 'defausser') {
      this.retirerCase(n);
      const gain = 2 + this.nb(s, ['jaune']);
      s.pieces += gain;
      g.defausse.push(id);
      this.addLog(`${this.nomSiege(i)} défausse ${CARTE[id].nom} (+${gain} pièces).`, 'muted');
      this.addFx('coup', { siege: i, type, carte: id, n, gain });
    } else if (type === 'merveille') {
      const chk = this.checkMerveille(i, merveille);
      if (!chk.ok) return false;
      this.retirerCase(n);
      this.payer(i, chk);
      const w = s.merveilles.find((x) => x.id === merveille);
      w.construite = true;
      w.carte = id;
      this.addLog(`${this.nomSiege(i)} construit ${MERV[merveille].nom}${chk.total ? ` (${chk.total} pièce${chk.total > 1 ? 's' : ''})` : ''} !`, 'big');
      this.addFx('coup', { siege: i, type, carte: id, n, merveille });
      this.effetsMerveille(i, merveille);
      this.limiteMerveilles();
    } else {
      return false;
    }
    g.dernierActif = i;
    this.continuer();
    this.changed();
    return true;
  }

  retirerCase(n) {
    const g = this.g;
    g.cases[n].prise = true;
    // Les cartes cachées devenues accessibles sont retournées.
    g.cases.forEach((k, m) => {
      if (!k.prise && !k.visible && this.accessible(m)) {
        k.visible = true;
        this.addFx('revele', { n: m });
      }
    });
  }

  /** Suite du tour : décisions en attente, fin d'âge ou joueur suivant. */
  continuer() {
    const g = this.g;
    if (g.etape === 'fin') return;
    // Plus de jeton sur le plateau : la paire ne rapporte rien.
    while (g.file.length && g.file[0].type === 'progres' && !g.plateau.length) g.file.shift();
    if (g.file.length) {
      g.decision = g.file.shift();
      this.armTimer();
      return;
    }
    g.decision = null;
    if (g.cases.every((k) => k.prise)) return this.finAge();
    if (g.rejouer) {
      this.addLog(`${this.nomSiege(g.actif)} rejoue.`, 'good');
      this.addFx('rejoue', { siege: g.actif });
    } else {
      g.actif = 1 - g.actif;
    }
    g.rejouer = false;
    this.armTimer();
  }

  // ── Effets ───────────────────────────────────────────────────────────────
  construire(i, id, { chaine = false } = {}) {
    const g = this.g;
    const s = g.sieges[i];
    const adv = g.sieges[1 - i];
    const d = CARTE[id];
    s.cite.push(id);
    let gain = 0;
    if (chaine && this.a(s, 'urbanisme')) gain += 4;
    if (d.gain) gain += d.gain;
    if (d.parCarte) gain += d.parCarte.pieces * this.nb(s, d.parCarte.couleurs);
    if (d.parMerveille) gain += d.parMerveille * this.nbMerveilles(s);
    if (d.guilde?.couleurs) gain += Math.max(this.nb(s, d.guilde.couleurs), this.nb(adv, d.guilde.couleurs));
    if (gain) {
      s.pieces += gain;
      this.addLog(`${this.nomSiege(i)} reçoit ${gain} pièce${gain > 1 ? 's' : ''}.`, 'muted');
    }
    if (d.boucliers) this.militaire(i, d.boucliers + (this.a(s, 'strategie') ? 1 : 0));
    if (g.etape === 'fin') return;
    if (d.sci) this.science(i, d.sci);
  }

  effetsMerveille(i, wid) {
    const g = this.g;
    const s = g.sieges[i];
    const w = MERV[wid];
    if (w.gain) s.pieces += w.gain;
    if (w.perte) {
      const p = this.perdre(1 - i, w.perte);
      if (p) this.addLog(`${this.nomSiege(1 - i)} perd ${p} pièce${p > 1 ? 's' : ''}.`, 'bad');
    }
    if (w.boucliers) this.militaire(i, w.boucliers); // la Stratégie ne s'applique pas aux Merveilles
    if (g.etape === 'fin') return;
    if (w.detruire) {
      const cibles = g.sieges[1 - i].cite.filter((id) => CARTE[id].couleur === w.detruire);
      if (cibles.length) g.file.push({ type: 'detruire', siege: i, couleur: w.detruire, options: cibles });
      else this.addLog(`${this.nomSiege(1 - i)} n’a aucune carte ${w.detruire} : pas de destruction.`, 'muted');
    }
    if (w.mausolee) {
      if (g.defausse.length) g.file.push({ type: 'mausolee', siege: i });
      else this.addLog('La défausse est vide : le Mausolée ne rapporte rien de plus.', 'muted');
    }
    if (w.bibliotheque && g.boite.length) {
      g.file.push({ type: 'bibliotheque', siege: i, options: shuffle(g.boite.slice()).slice(0, 3) });
    }
    if (w.rejouer || this.a(s, 'theologie')) g.rejouer = true;
  }

  /** 7 Merveilles au plus : dès la 7e, la dernière non construite est retirée. */
  limiteMerveilles() {
    const g = this.g;
    const total = g.sieges.reduce((t, s) => t + this.nbMerveilles(s), 0);
    if (total < 7) return;
    g.sieges.forEach((s, i) => s.merveilles.forEach((w) => {
      if (!w.construite && !w.retiree) {
        w.retiree = true;
        this.addLog(`7 Merveilles construites : ${MERV[w.id].nom} (${this.nomSiege(i)}) retourne dans la boîte.`, 'muted');
        this.addFx('merveille-retiree', { siege: i, merveille: w.id });
      }
    }));
  }

  militaire(i, n) {
    const g = this.g;
    const dir = i === 0 ? 1 : -1;
    const adv = 1 - i;
    const avant = g.pion;
    for (let k = 0; k < n; k++) {
      g.pion += dir;
      const pos = g.pion * dir; // avancée vers la capitale adverse
      for (const [seuil, valeur] of [[3, 2], [6, 5]]) {
        const cle = `${adv}-${valeur}`;
        if (pos === seuil && g.jetons[cle]) {
          g.jetons[cle] = false;
          const p = this.perdre(adv, valeur);
          this.addLog(`Jeton Militaire : ${this.nomSiege(adv)} perd ${p} pièce${p > 1 ? 's' : ''}.`, 'bad');
          this.addFx('pillage', { siege: adv, pieces: p });
        }
      }
      if (pos >= 9) {
        this.addFx('militaire', { de: avant, a: g.pion });
        this.victoire(i, 'militaire');
        return;
      }
    }
    this.addFx('militaire', { de: avant, a: g.pion });
  }

  science(i, symbole) {
    const g = this.g;
    const s = g.sieges[i];
    s.sci[symbole] = (s.sci[symbole] || 0) + 1;
    if (Object.keys(s.sci).length >= 6) {
      this.victoire(i, 'science');
      return;
    }
    if (s.sci[symbole] === 2 && g.plateau.length) {
      g.file.push({ type: 'progres', siege: i, options: g.plateau.slice() });
      this.addLog(`${this.nomSiege(i)} réunit une paire de symboles : il choisit un jeton Progrès.`, 'good');
    }
  }

  gagnerProgres(i, pid) {
    const g = this.g;
    const s = g.sieges[i];
    s.progres.push(pid);
    this.addLog(`${this.nomSiege(i)} obtient le Progrès ${D.PROGRES[pid].nom}.`, 'good');
    this.addFx('progres', { siege: i, progres: pid });
    if (pid === 'agriculture' || pid === 'urbanisme') s.pieces += 6;
    if (pid === 'loi') this.science(i, 'balance');
  }

  // ── Décisions (Progrès, destruction, Mausolée, Grande Bibliothèque) ─────
  actChoix(pid, { id } = {}) {
    const g = this.g;
    const i = this.indice(pid);
    if (!g || this.phase !== 'play' || !g.decision || g.decision.siege !== i) return false;
    if (!this.appliquerChoix(g.decision, id)) return false;
    this.continuer();
    this.changed();
    return true;
  }

  appliquerChoix(dec, id) {
    const g = this.g;
    const i = dec.siege;
    if (dec.type === 'progres') {
      if (!g.plateau.includes(id)) return false;
      g.plateau.splice(g.plateau.indexOf(id), 1);
      g.decision = null;
      this.gagnerProgres(i, id);
      return true;
    }
    if (dec.type === 'bibliotheque') {
      if (!dec.options.includes(id)) return false;
      g.boite.splice(g.boite.indexOf(id), 1);
      g.decision = null;
      this.gagnerProgres(i, id);
      return true;
    }
    if (dec.type === 'detruire') {
      const adv = g.sieges[1 - i];
      if (!dec.options.includes(id) || !adv.cite.includes(id)) return false;
      adv.cite.splice(adv.cite.indexOf(id), 1);
      g.defausse.push(id);
      g.decision = null;
      this.addLog(`${this.nomSiege(i)} fait défausser ${CARTE[id].nom} à ${this.nomSiege(1 - i)}.`, 'bad');
      this.addFx('detruit', { siege: 1 - i, carte: id });
      return true;
    }
    if (dec.type === 'mausolee') {
      if (!g.defausse.includes(id)) return false;
      g.defausse.splice(g.defausse.indexOf(id), 1);
      g.decision = null;
      this.addLog(`${this.nomSiege(i)} construit gratuitement ${CARTE[id].nom} tirée de la défausse.`, 'good');
      this.addFx('mausolee', { siege: i, carte: id });
      this.construire(i, id);
      return true;
    }
    return false;
  }

  // ── Fin de partie ────────────────────────────────────────────────────────
  points(i) {
    const g = this.g;
    const s = g.sieges[i];
    const adv = g.sieges[1 - i];
    const pos = i === 0 ? g.pion : -g.pion;
    const p = { militaire: pos >= 6 ? 10 : pos >= 3 ? 5 : pos >= 1 ? 2 : 0, bleu: 0, vert: 0, jaune: 0, guildes: 0, merveilles: 0, progres: 0, tresor: Math.floor(s.pieces / 3) };
    for (const id of s.cite) {
      const d = CARTE[id];
      if (d.pv && p[d.couleur] !== undefined) p[d.couleur] += d.pv;
      const gu = d.guilde;
      if (gu?.couleurs) p.guildes += Math.max(this.nb(s, gu.couleurs), this.nb(adv, gu.couleurs));
      if (gu?.merveilles) p.guildes += gu.merveilles * Math.max(this.nbMerveilles(s), this.nbMerveilles(adv));
      if (gu?.tresor) p.guildes += Math.floor(Math.max(s.pieces, adv.pieces) / 3);
    }
    for (const w of s.merveilles) if (w.construite) p.merveilles += MERV[w.id].pv || 0;
    if (this.a(s, 'agriculture')) p.progres += 4;
    if (this.a(s, 'philosophie')) p.progres += 7;
    if (this.a(s, 'mathematiques')) p.progres += 3 * s.progres.length;
    p.total = p.militaire + p.bleu + p.vert + p.jaune + p.guildes + p.merveilles + p.progres + p.tresor;
    return p;
  }

  victoire(i, raison) {
    const g = this.g;
    g.etape = 'fin';
    g.decision = null;
    g.file = [];
    g.score = [this.points(0), this.points(1)];
    g.fin = { raison, gagnants: [i] };
    const quoi = { militaire: 'par suprématie militaire', science: 'par suprématie scientifique', abandon: 'par abandon', forfait: 'par forfait' }[raison] || '';
    this.addLog(`${this.nomSiege(i)} remporte la partie ${quoi} !`, 'big');
    this.finish([g.sieges[i].id], { raison, score: g.score });
  }

  finCivile() {
    const g = this.g;
    const sc = [this.points(0), this.points(1)];
    let gagnants;
    if (sc[0].total !== sc[1].total) gagnants = [sc[0].total > sc[1].total ? 0 : 1];
    else if (sc[0].bleu !== sc[1].bleu) gagnants = [sc[0].bleu > sc[1].bleu ? 0 : 1];
    else gagnants = [0, 1];
    g.etape = 'fin';
    g.score = sc;
    g.fin = { raison: 'civile', gagnants };
    this.addLog(gagnants.length === 2 ? 'Égalité parfaite : victoire partagée !' : `${this.nomSiege(gagnants[0])} remporte une victoire civile (${sc[gagnants[0]].total} à ${sc[1 - gagnants[0]].total}).`, 'big');
    this.finish(gagnants.map((k) => g.sieges[k].id), { raison: 'civile', score: sc });
  }

  // ── Minuterie, absences, départs ─────────────────────────────────────────
  /** Siège dont on attend une décision. */
  attendu() {
    const g = this.g;
    if (!g || this.phase !== 'play') return -1;
    if (g.etape === 'selection') return g.selection.ordre[g.selection.k];
    if (g.etape === 'debut') return g.choisit;
    if (g.etape === 'jeu') return g.decision ? g.decision.siege : g.actif;
    return -1;
  }

  armTimer() {
    this.clearTimer();
    if (!this.g || this.phase !== 'play' || this.attendu() < 0) return;
    const ms = this.settings.tour * 1000;
    if (ms) this.setTimer(ms, () => this.tempsEcoule());
  }

  /** Temps écoulé : choix au hasard, ou défausse d'une carte accessible. */
  tempsEcoule() {
    const g = this.g;
    const i = this.attendu();
    if (i < 0) return;
    this.addLog(`Temps écoulé pour ${this.nomSiege(i)}.`, 'muted');
    this.jouerPour(i);
  }

  /** Joue à la place du siège i (minuterie ; aussi utilisé par les tests). */
  jouerPour(i) {
    const g = this.g;
    const pid = g.sieges[i].id;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (g.etape === 'selection') return this.actSelection(pid, { merveille: pick(g.selection.offertes) });
    if (g.etape === 'debut') return this.actPremier(pid, { moi: true });
    if (g.decision) {
      const d = g.decision;
      const opts = d.type === 'mausolee' ? g.defausse : d.type === 'progres' ? g.plateau : d.options;
      return this.actChoix(pid, { id: pick(opts) });
    }
    const libres = g.cases.map((_, n) => n).filter((n) => this.accessible(n));
    return this.actCoup(pid, { n: pick(libres), type: 'defausser' });
  }

  onConnectionChange(pid) {
    const i = this.indice(pid);
    if (i < 0) return;
    this.g.sieges[i].absentDepuis = this.player(pid)?.connected ? null : this.clock.now();
  }

  /** L'adversaire est absent depuis plus d'une minute : réclamer la victoire. */
  actForfait(pid) {
    const g = this.g;
    const i = this.indice(pid);
    if (!g || this.phase !== 'play' || i < 0) return false;
    const adv = g.sieges[1 - i];
    if (adv.absentDepuis === null || this.clock.now() - adv.absentDepuis < ABSENT_MS) return false;
    this.victoire(i, 'forfait');
    this.changed();
    return true;
  }

  onLeave(pid) {
    const g = this.g;
    const i = this.indice(pid);
    if (!g || this.phase !== 'play' || i < 0) return;
    this.addLog(`${this.nomSiege(i)} quitte la partie.`, 'bad');
    this.victoire(1 - i, 'abandon');
  }

  // ── Vue ──────────────────────────────────────────────────────────────────
  gameView(pid) {
    const g = this.g;
    if (!g) return null;
    const mi = this.indice(pid);
    const vue = {
      etape: g.etape,
      age: g.age,
      actif: g.actif,
      attendu: this.attendu(),
      pion: g.pion,
      jetons: g.jetons,
      plateau: g.plateau,
      sieges: g.sieges.map((s, i) => {
        const prod = this.production(s);
        return {
          id: s.id,
          pieces: s.pieces,
          cite: s.cite,
          merveilles: s.merveilles.map((w) => ({ id: w.id, construite: w.construite, retiree: !!w.retiree })),
          progres: s.progres,
          sci: s.sci,
          prod: prod.fixe,
          choix: prod.choix.map((o) => o.join('')),
          prix: this.prix(i),
          points: this.points(i),
          absentDepuis: s.absentDepuis,
        };
      }),
      // Une carte cachée ne révèle que son dos (Âge ou Guilde).
      cases: g.cases.map((k, n) => ({
        rang: k.rang,
        x: k.x,
        prise: k.prise,
        visible: k.visible,
        carte: k.visible && !k.prise ? k.carte : null,
        dos: k.prise ? null : CARTE[k.carte].age === 'G' ? 'G' : g.age,
        libre: this.accessible(n),
      })),
      defausse: g.defausse,
      selection: g.selection ? { manche: g.selection.manche, offertes: g.selection.offertes, tour: g.selection.ordre[g.selection.k] } : null,
      decision: g.decision ? {
        type: g.decision.type,
        siege: g.decision.siege,
        couleur: g.decision.couleur || null,
        // Les 3 jetons de la Grande Bibliothèque restent secrets pour l'adversaire.
        options: g.decision.type === 'bibliotheque' && g.decision.siege !== mi ? null : g.decision.type === 'progres' ? g.plateau : g.decision.options || null,
      } : null,
      choisit: g.choisit,
      rejouer: g.rejouer,
      merveillesConstruites: g.sieges.reduce((t, s) => t + this.nbMerveilles(s), 0),
      boite: g.boite.length,
      score: g.score,
      fin: g.fin,
      moi: mi,
      absentMs: ABSENT_MS,
    };
    if (mi >= 0 && g.etape === 'jeu') {
      // Pour chaque carte accessible : prix de construction et Merveilles possibles.
      const s = g.sieges[mi];
      const options = {};
      g.cases.forEach((k, n) => {
        if (!k.visible || !this.accessible(n)) return;
        const b = this.checkCarte(mi, k.carte);
        options[n] = { construire: { ok: b.ok, total: b.total, commerce: b.commerce, achats: b.achats, chaine: b.chaine } };
      });
      vue.options = options;
      vue.gainDefausse = 2 + this.nb(s, ['jaune']);
      vue.merveillesPossibles = s.merveilles.filter((w) => !w.construite && !w.retiree).map((w) => {
        const c = this.checkMerveille(mi, w.id);
        return { id: w.id, ok: c.ok, total: c.total, achats: c.achats };
      });
    }
    return vue;
  }
}

module.exports = {
  id: 'duel',
  createRoom: (code, opts) => new DuelRoom(code, opts),
  events: {
    'game:selection': 'actSelection',
    'game:coup': 'actCoup',
    'game:choix': 'actChoix',
    'game:premier': 'actPremier',
    'game:forfait': 'actForfait',
  },
  // Données statiques pour l'affichage : GET /donnees/duel
  donnees: {
    cartes: CARTE,
    merveilles: MERV,
    progres: D.PROGRES,
    symboles: D.SYMBOLES,
    chaines: D.CHAINES,
    ressources: NOM_RES,
  },
  DuelRoom,
  CARTE,
  MERV,
  coutRessources,
  validateSettings,
};
