// duel.test.js — Règles de 7 Wonders Duel (moteur seul, sans réseau).
// Lancer : node --test tests/duel.test.js   (depuis server/)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DuelRoom, CARTE, coutRessources } = require('../jeux/duel.js');
const { fakeClock } = require('./aide');

/** Partie p0 (siège 0, 1er joueur) contre p1, merveilles imposées, âge I lancé. */
function setup({ settings = { merveilles: 'decouverte' } } = {}) {
  const clock = fakeClock();
  const room = new DuelRoom('TEST', { clock });
  room.addPlayer('p0', 'Antoine', 's0');
  room.addPlayer('p1', 'Bruno', 's1');
  assert.equal(room.setSettings('p0', settings), null);
  assert.equal(room.start('p0'), null);
  const g = room.g;
  // Sièges dans l'ordre p0, p1 (le tirage au sort est ignoré).
  g.sieges.forEach((s, i) => { s.id = 'p' + i; });
  return { room, clock, g, S: (i) => g.sieges[i] };
}

/** Remplace la structure par des cartes toutes accessibles (+ une réserve pour ne pas finir l'âge). */
function poser(room, cartes, { reserve = true } = {}) {
  const liste = reserve ? [...cartes, 'tour-de-garde'] : cartes;
  room.g.cases = liste.map((carte, k) => ({ carte, rang: 0, x: k * 4, visible: true, prise: false }));
}
const n = (room, carte) => room.g.cases.findIndex((k) => k.carte === carte && !k.prise);
const coup = (room, pid, carte, type = 'construire', merveille) => room.actCoup(pid, { n: n(room, carte), type, merveille });

test('mise en place : 7 pièces, 5 Progrès, 20 cartes, rangée du bas accessible, cartes cachées secrètes', () => {
  const { room, g, S } = setup();
  assert.equal(S(0).pieces, 7);
  assert.equal(S(1).pieces, 7);
  assert.equal(g.plateau.length, 5);
  assert.equal(g.boite.length, 5);
  assert.equal(g.cases.length, 20);
  assert.equal(g.age, 1);
  assert.equal(g.actif, 0);
  const libres = g.cases.filter((_, k) => room.accessible(k));
  assert.equal(libres.length, 6, 'âge I : les 6 cartes du bas');
  assert.ok(libres.every((k) => k.visible));
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => g.cases.find((k) => k.rang === r).visible), [true, false, true, false, true]);
  const v = room.gameView('p1');
  v.cases.forEach((k, i) => { if (!g.cases[i].visible) assert.equal(k.carte, null, 'carte cachée révélée !'); });
  assert.equal(new Set(g.cases.map((k) => k.carte)).size, 20);
  assert.ok(g.cases.every((k) => CARTE[k.carte].age === 1));
});

test('structures : âge II en pyramide inversée, âge III avec 3 guildes et dos « G »', () => {
  const { room, g } = setup();
  room.debutAge(2, 0);
  assert.equal(g.cases.filter((_, k) => room.accessible(k)).length, 2);
  room.debutAge(3, 1);
  assert.equal(g.cases.length, 20);
  assert.equal(g.cases.filter((k) => CARTE[k.carte].age === 'G').length, 3);
  assert.equal(g.actif, 1);
  const v = room.gameView('p0');
  const dos = v.cases.map((k) => k.dos);
  assert.equal(dos.filter((d) => d === 'G').length, 3);
  assert.equal(g.cases.filter((_, k) => room.accessible(k)).length, 2);
});

test('sélection des Merveilles : 1-2-1 puis 1-2-1 en commençant par le 2e joueur', () => {
  const { room, g, S } = setup({ settings: { merveilles: 'selection' } });
  assert.equal(g.etape, 'selection');
  const prendre = (pid) => room.actSelection(pid, { merveille: g.selection.offertes[0] });
  assert.equal(prendre('p1'), false, 'pas son tour');
  assert.equal(prendre('p0'), true);
  assert.equal(prendre('p0'), false);
  assert.equal(prendre('p1'), true);
  assert.equal(prendre('p1'), true);
  // La 4e revient d'office à p0 ; deuxième tirage : p1 commence.
  assert.equal(S(0).merveilles.length, 2);
  assert.equal(S(1).merveilles.length, 2);
  assert.equal(g.selection.manche, 2);
  assert.equal(prendre('p0'), false);
  assert.equal(prendre('p1'), true);
  assert.equal(prendre('p0'), true);
  assert.equal(prendre('p0'), true);
  assert.equal(S(0).merveilles.length, 4);
  assert.equal(S(1).merveilles.length, 4);
  assert.equal(new Set([...S(0).merveilles, ...S(1).merveilles].map((w) => w.id)).size, 8);
  assert.equal(g.etape, 'jeu');
  assert.equal(g.actif, 0);
});

test('accessibilité : une carte cachée se retourne quand plus rien ne la recouvre', () => {
  const { room, g } = setup();
  // Âge I : la carte cachée du rang 3 en x = -4 est recouverte par x = -5 et x = -3 du rang 4.
  const cachee = g.cases.findIndex((k) => k.rang === 3 && k.x === -4);
  const a = g.cases.findIndex((k) => k.rang === 4 && k.x === -5);
  const b = g.cases.findIndex((k) => k.rang === 4 && k.x === -3);
  assert.equal(g.cases[cachee].visible, false);
  assert.equal(room.actCoup('p0', { n: cachee, type: 'defausser' }), false, 'recouverte');
  assert.equal(room.actCoup('p0', { n: a, type: 'defausser' }), true);
  assert.equal(g.cases[cachee].visible, false);
  assert.equal(room.actCoup('p1', { n: b, type: 'defausser' }), true);
  assert.equal(g.cases[cachee].visible, true);
  assert.ok(room.accessible(cachee));
});

test('commerce : exemples de la règle (Fortifications 5, Aqueduc 12, Caravansérail 7)', () => {
  const { room, S } = setup();
  // Bruno (p1) : Carrière (2 pierres). Antoine (p0) : 1 argile.
  S(1).cite = ['carriere'];
  S(0).cite = ['bassin-argileux'];
  S(1).pieces = 20;
  S(0).pieces = 20;
  assert.equal(room.checkCarte(1, 'fortifications').total, 5, '3 pour l’argile + 2 pour le papyrus');
  assert.equal(room.checkCarte(0, 'aqueduc').total, 12, '3 pierres à 4');
  S(0).cite = ['verrerie'];
  assert.equal(room.checkCarte(1, 'caravanserail').total, 7, '2 pièces + verre 3 + papyrus 2');
  // Dépôt de pierre : la pierre à 1 pièce.
  S(0).cite.push('depot-pierre');
  assert.equal(room.checkCarte(0, 'aqueduc').total, 3);
  // Production jaune / Merveille adverse : sans effet sur le prix.
  S(1).cite = ['forum'];
  assert.equal(room.prix(0).G, 2);
});

test('coût : les productions « au choix » servent au mieux ; remise sur les plus chères', () => {
  const prix = { W: 2, C: 2, S: 4, G: 3, P: 2 };
  const prod = { fixe: { W: 1 }, choix: [['W', 'C', 'S'], ['G', 'P']] };
  assert.equal(coutRessources('WSG', prod, prix).total, 0);
  assert.equal(coutRessources('WWSG', prod, prix).total, 2, 'le choix couvre la pierre (4), on achète le bois (2)');
  assert.equal(coutRessources('WWSSG', prod, prix).total, 6);
  assert.equal(coutRessources('SSSG', { fixe: {}, choix: [] }, prix, 2).total, 7, 'remise sur 2 pierres : reste pierre 4 + verre 3');
});

test('construire, défausser (2 + jaunes), chaînage gratuit, Urbanisme +4', () => {
  const { room, S, g } = setup();
  poser(room, ['bains', 'mine', 'aqueduc', 'taverne']);
  S(0).cite = ['gisement'];
  assert.equal(coup(room, 'p0', 'bains'), true);
  assert.deepEqual(S(0).cite, ['gisement', 'bains']);
  assert.equal(g.actif, 1);
  S(1).cite = ['depot-bois', 'taverne'];
  assert.equal(coup(room, 'p1', 'mine', 'defausser'), true);
  assert.equal(S(1).pieces, 7 + 4);
  assert.deepEqual(g.defausse, ['mine']);
  S(0).progres = ['urbanisme'];
  S(0).pieces = 0;
  assert.equal(coup(room, 'p0', 'aqueduc'), true, 'gratuit grâce aux Bains');
  assert.equal(S(0).pieces, 4, 'Urbanisme : 4 pièces');
  assert.equal(coup(room, 'p1', 'taverne'), true);
  assert.equal(S(1).pieces, 11 + 4);
});

test('pas assez de pièces : construction refusée, la défausse reste possible', () => {
  const { room, S } = setup();
  poser(room, ['pretoire']);
  S(0).pieces = 7;
  assert.equal(coup(room, 'p0', 'pretoire'), false);
  assert.equal(coup(room, 'p0', 'pretoire', 'defausser'), true);
});

test('pièces par carte à la construction : Phare (elle comprise), Arène, Chambre de commerce', () => {
  const { room, S } = setup();
  poser(room, ['phare', 'x', 'arene', 'y', 'chambre-de-commerce'].map((c) => (c.length === 1 ? 'tour-de-garde' : c)));
  S(0).cite = ['taverne', 'depot-bois', 'briqueterie', 'verrerie', 'gisement', 'bassin-argileux', 'chantier'];
  S(0).pieces = 0;
  assert.equal(coup(room, 'p0', 'phare'), true, 'chaînage Taverne');
  assert.equal(S(0).pieces, 3, '3 jaunes');
  room.g.actif = 0;
  S(0).cite.push('brasserie');
  S(0).merveilles[0].construite = true;
  S(0).merveilles[1].construite = true;
  assert.equal(coup(room, 'p0', 'arene'), true);
  assert.equal(S(0).pieces, 3 + 4);
  room.g.actif = 0;
  S(0).cite.push('sechoir', 'presse');
  const avant = S(0).pieces;
  assert.equal(coup(room, 'p0', 'chambre-de-commerce'), true);
  assert.equal(S(0).pieces, avant + 9, '3 cartes grises × 3');
});

test('militaire : jetons de 2 et 5 pièces, Stratégie (+1 sauf Merveilles), suprématie', () => {
  const { room, S, g } = setup();
  poser(room, ['muraille', 'place-d-armes', 'arsenal', 'pretoire']);
  S(0).cite = ['carriere', 'briqueterie', 'soufflerie', 'scierie'];
  S(0).pieces = 30;
  S(1).pieces = 3;
  g.pion = 1;
  assert.equal(coup(room, 'p0', 'muraille'), true);
  assert.equal(g.pion, 3);
  assert.equal(S(1).pieces, 1, 'jeton de 2 : perd 2 pièces');
  assert.equal(g.jetons['1-2'], false);
  g.actif = 0;
  S(0).progres = ['strategie'];
  assert.equal(coup(room, 'p0', 'place-d-armes'), true);
  assert.equal(g.pion, 6, '2 boucliers + Stratégie');
  assert.equal(S(1).pieces, 0, 'jeton de 5 : perd tout ce qu’il a');
  g.actif = 0;
  assert.equal(coup(room, 'p0', 'arsenal'), true);
  assert.equal(g.pion, 9);
  assert.equal(room.phase, 'ended');
  assert.deepEqual(g.fin, { raison: 'militaire', gagnants: [0] });
});

test('militaire : le pion recule vers l’autre camp ; un jeton pris ne revient pas', () => {
  const { room, S, g } = setup();
  poser(room, ['tour-de-garde', 'muraille']);
  g.pion = 3;
  g.jetons['1-2'] = false;
  g.actif = 1;
  S(1).cite = ['carriere'];
  assert.equal(coup(room, 'p1', 'muraille'), true);
  assert.equal(g.pion, 1);
  g.actif = 0;
  assert.equal(coup(room, 'p0', 'tour-de-garde'), true);
  assert.equal(g.pion, 2);
  assert.equal(S(1).pieces, 7);
});

test('science : une paire donne un jeton Progrès, 6 symboles différents = victoire', () => {
  const { room, S, g } = setup();
  poser(room, ['bibliotheque', 'academie']);
  g.plateau = ['agriculture', 'loi', 'philosophie', 'economie', 'strategie'];
  S(0).cite = ['scriptorium', 'officine', 'atelier', 'apothicaire'];
  S(0).sci = { plume: 1, mortier: 1, fil: 1, roue: 1 };
  assert.equal(coup(room, 'p0', 'bibliotheque'), true, 'chaînage Scriptorium');
  assert.equal(g.decision.type, 'progres');
  assert.equal(g.actif, 0);
  assert.equal(room.actChoix('p1', { id: 'agriculture' }), false, 'pas à lui de choisir');
  assert.equal(room.actChoix('p0', { id: 'loi' }), true);
  assert.deepEqual(S(0).progres, ['loi']);
  assert.equal(S(0).sci.balance, 1);
  assert.equal(g.actif, 1, 'la main passe après la décision');
  assert.equal(g.plateau.length, 4);
  g.actif = 0;
  S(0).pieces = 30;
  assert.equal(coup(room, 'p0', 'academie'), true);
  assert.equal(room.phase, 'ended');
  assert.deepEqual(g.fin, { raison: 'science', gagnants: [0] });
});

test('Merveilles : Via Appia (+3, −3 à l’adversaire, rejouer) ; la carte glissée dessous', () => {
  const { room, S, g } = setup();
  poser(room, ['tour-de-garde', 'chantier']);
  S(1).merveilles = [{ id: 'via-appia', construite: false }];
  S(1).cite = ['presse', 'briqueterie', 'carriere'];
  g.actif = 1;
  S(0).pieces = 2;
  assert.equal(coup(room, 'p1', 'chantier', 'merveille', 'via-appia'), true);
  assert.equal(S(1).merveilles[0].construite, true);
  assert.equal(S(1).pieces, 10);
  assert.equal(S(0).pieces, 0);
  assert.equal(g.actif, 1, 'rejoue');
  assert.ok(!S(1).cite.includes('chantier'), 'la carte ne compte pas comme bâtiment');
  assert.ok(!g.defausse.includes('chantier'));
});

test('Merveilles : Circus Maximus / Statue de Zeus font défausser une carte adverse', () => {
  const { room, S, g } = setup();
  poser(room, ['chantier', 'mine']);
  S(0).merveilles = [{ id: 'statue-de-zeus', construite: false }, { id: 'circus-maximus', construite: false }];
  S(0).pieces = 40;
  S(1).cite = ['carriere', 'verrerie', 'theatre'];
  assert.equal(coup(room, 'p0', 'chantier', 'merveille', 'statue-de-zeus'), true);
  assert.equal(g.decision.type, 'detruire');
  assert.deepEqual(g.decision.options, ['carriere']);
  assert.equal(room.actChoix('p0', { id: 'theatre' }), false);
  assert.equal(room.actChoix('p0', { id: 'carriere' }), true);
  assert.deepEqual(S(1).cite, ['verrerie', 'theatre']);
  assert.ok(g.defausse.includes('carriere'));
  assert.equal(g.pion, 1);
  g.actif = 0;
  S(1).cite = ['theatre'];
  assert.equal(coup(room, 'p0', 'mine', 'merveille', 'circus-maximus'), true);
  assert.equal(g.decision, null, 'aucune carte grise : rien à faire');
  assert.equal(g.actif, 1);
});

test('Mausolée : construire gratuitement une carte de la défausse (effets compris)', () => {
  const { room, S, g } = setup();
  poser(room, ['chantier']);
  S(0).merveilles = [{ id: 'mausolee', construite: false }];
  S(0).pieces = 40;
  g.defausse = ['pretoire', 'bains'];
  assert.equal(coup(room, 'p0', 'chantier', 'merveille', 'mausolee'), true);
  assert.equal(g.decision.type, 'mausolee');
  const pieces = S(0).pieces;
  assert.equal(room.actChoix('p0', { id: 'pretoire' }), true);
  assert.ok(S(0).cite.includes('pretoire'));
  assert.equal(S(0).pieces, pieces, 'gratuit');
  assert.equal(g.pion, 3);
  assert.deepEqual(g.defausse, ['bains']);
});

test('Grande Bibliothèque : 3 jetons écartés, secrets pour l’adversaire', () => {
  const { room, S, g } = setup();
  poser(room, ['chantier']);
  S(0).merveilles = [{ id: 'grande-bibliotheque', construite: false }];
  S(0).pieces = 40;
  assert.equal(coup(room, 'p0', 'chantier', 'merveille', 'grande-bibliotheque'), true);
  assert.equal(g.decision.type, 'bibliotheque');
  assert.equal(g.decision.options.length, 3);
  assert.ok(g.decision.options.every((p) => g.boite.includes(p)));
  assert.equal(room.gameView('p1').decision.options, null);
  assert.deepEqual(room.gameView('p0').decision.options, g.decision.options);
  const choix = g.decision.options[0];
  assert.equal(room.actChoix('p0', { id: choix }), true);
  assert.ok(S(0).progres.includes(choix));
  assert.equal(g.boite.length, 4);
});

test('Théologie : toute Merveille fait rejouer ; 7e Merveille : la dernière est retirée', () => {
  const { room, S, g } = setup();
  poser(room, ['chantier', 'mine']);
  S(0).progres = ['theologie'];
  S(0).pieces = 60;
  S(0).merveilles = [{ id: 'pyramides', construite: false }, { id: 'colosse', construite: true }, { id: 'sphinx', construite: true }, { id: 'piree', construite: true }];
  S(1).merveilles = [{ id: 'mausolee', construite: false }, { id: 'via-appia', construite: true }, { id: 'jardins-suspendus', construite: true }, { id: 'grand-phare', construite: true }];
  assert.equal(coup(room, 'p0', 'chantier', 'merveille', 'pyramides'), true);
  assert.equal(g.actif, 0, 'Théologie : rejoue');
  assert.equal(S(1).merveilles[0].retiree, true, 'le Mausolée retourne dans la boîte');
  g.actif = 1;
  assert.equal(coup(room, 'p1', 'mine', 'merveille', 'mausolee'), false);
});

test('Économie : l’argent du commerce adverse revient au propriétaire', () => {
  const { room, S } = setup();
  poser(room, ['bains']);
  S(1).progres = ['economie'];
  S(1).cite = ['gisement'];
  assert.equal(coup(room, 'p0', 'bains'), true);
  assert.equal(S(0).pieces, 7 - 3);
  assert.equal(S(1).pieces, 7 + 3);
});

test('Maçonnerie (bleus) et Architecture (Merveilles) : 2 ressources de moins', () => {
  const { room, S } = setup();
  S(0).progres = ['maconnerie', 'architecture'];
  S(0).pieces = 0;
  assert.equal(room.checkCarte(0, 'statue').total, 0);
  assert.equal(room.checkCarte(0, 'aqueduc').total, 2);
  assert.equal(room.checkCarte(0, 'muraille').total, 4, 'rouge : pas de remise');
  S(0).merveilles = [{ id: 'colosse', construite: false }];
  assert.equal(room.checkMerveille(0, 'colosse').total, 4);
});

test('fin d’âge : le joueur mené choisit qui commence ; pion au centre : le dernier actif', () => {
  const { room, g } = setup();
  poser(room, ['chantier'], { reserve: false });
  g.pion = 2; // p1 est mené
  assert.equal(coup(room, 'p0', 'chantier'), true);
  assert.equal(g.etape, 'debut');
  assert.equal(g.choisit, 1);
  assert.equal(room.actPremier('p0', { moi: true }), false);
  assert.equal(room.actPremier('p1', { moi: false }), true);
  assert.equal(g.age, 2);
  assert.equal(g.actif, 0);
  poser(room, ['scierie'], { reserve: false });
  g.pion = 0;
  assert.equal(coup(room, 'p0', 'scierie', 'defausser'), true);
  assert.equal(g.age, 3);
  assert.equal(g.actif, 0, 'dernier joueur actif');
});

test('rejouer en fin d’âge : l’effet est perdu', () => {
  const { room, S, g } = setup();
  poser(room, ['chantier'], { reserve: false });
  S(0).merveilles = [{ id: 'sphinx', construite: false }];
  S(0).pieces = 40;
  g.pion = -1; // p0 mené
  assert.equal(coup(room, 'p0', 'chantier', 'merveille', 'sphinx'), true);
  assert.equal(g.etape, 'debut');
  assert.equal(g.rejouer, false);
});

test('décompte : militaire, bleus, verts, jaunes, guildes, Merveilles, Progrès, trésor', () => {
  const { room, S, g } = setup();
  g.pion = 4;
  S(0).cite = ['palace', 'academie', 'port', 'guilde-magistrats', 'guilde-usuriers', 'guilde-batisseurs', 'theatre'];
  S(1).cite = ['tribunal', 'statue', 'autel'];
  S(0).merveilles = [{ id: 'pyramides', construite: true }, { id: 'colosse', construite: false }];
  S(1).merveilles = [{ id: 'sphinx', construite: true }, { id: 'piree', construite: true }];
  S(0).progres = ['mathematiques', 'philosophie', 'agriculture'];
  S(0).pieces = 10;
  S(1).pieces = 14;
  const p = room.points(0);
  assert.equal(p.militaire, 5);
  assert.equal(p.bleu, 10);
  assert.equal(p.vert, 3);
  assert.equal(p.jaune, 3);
  assert.equal(p.guildes, 3 + 4 + 4, 'Magistrats 3 bleus (p1), Usuriers 14/3, Bâtisseurs 2×2');
  assert.equal(p.merveilles, 9);
  assert.equal(p.progres, 9 + 7 + 4);
  assert.equal(p.tresor, 3);
  assert.equal(room.points(1).militaire, 0);
});

test('fin de l’Âge III : victoire civile ; égalité départagée par les bleus', () => {
  const { room, S, g } = setup();
  room.debutAge(3, 0);
  poser(room, ['obelisque'], { reserve: false });
  S(0).cite = ['theatre'];
  S(1).cite = ['taverne'];
  S(0).pieces = 0;
  S(1).pieces = 9;
  // Après la défausse de l'obélisque (+2 pièces) : p0 = 3 (Théâtre) ; p1 = 3 (trésor) → égalité, p0 a plus de bleu.
  assert.equal(coup(room, 'p0', 'obelisque', 'defausser'), true);
  assert.equal(room.phase, 'ended');
  assert.equal(g.fin.raison, 'civile');
  assert.equal(g.score[0].total, 3);
  assert.equal(g.score[1].total, 3);
  assert.deepEqual(g.fin.gagnants, [0]);
  assert.deepEqual(room.winnerIds, ['p0']);
});

test('égalité parfaite (même total, mêmes bleus) : victoire partagée', () => {
  const { room, S, g } = setup();
  room.debutAge(3, 0);
  poser(room, ['obelisque'], { reserve: false });
  S(0).pieces = 7; // 7 + 2 = 9 → 3 points
  S(1).pieces = 9;
  assert.equal(coup(room, 'p0', 'obelisque', 'defausser'), true);
  assert.deepEqual(g.fin.gagnants, [0, 1]);
});

test('départ en partie : l’autre gagne par abandon', () => {
  const { room, g } = setup();
  room.removePlayer('p1');
  assert.equal(room.phase, 'ended');
  assert.deepEqual(g.fin, { raison: 'abandon', gagnants: [0] });
});

test('absence : victoire réclamable après une minute seulement', () => {
  const { room, clock, g } = setup();
  room.disconnect('p1', 's1');
  assert.equal(room.actForfait('p0'), false);
  clock.advance(59000);
  assert.equal(room.actForfait('p0'), false);
  clock.advance(2000);
  assert.equal(room.actForfait('p1'), false);
  assert.equal(room.actForfait('p0'), true);
  assert.deepEqual(g.fin, { raison: 'forfait', gagnants: [0] });
});

test('retour après absence : plus de forfait possible', () => {
  const { room, clock } = setup();
  room.disconnect('p1', 's1');
  clock.advance(30000);
  room.reconnect('p1', 's1');
  clock.advance(60000);
  assert.equal(room.actForfait('p0'), false);
});

test('minuterie : défausse automatique à la fin du temps', () => {
  const { room, clock, g } = setup({ settings: { merveilles: 'decouverte', tour: 60 } });
  assert.ok(room.timerInfo);
  clock.advance(60000);
  assert.equal(g.defausse.length, 1);
  assert.equal(g.actif, 1);
  assert.ok(room.timerInfo, 'minuterie relancée pour l’autre joueur');
});

test('coups interdits : pas son tour, carte recouverte, Merveille inconnue, pendant une décision', () => {
  const { room, S, g } = setup();
  const couverte = g.cases.findIndex((k) => k.rang === 0);
  const libre = g.cases.findIndex((k, i) => room.accessible(i));
  assert.equal(room.actCoup('p1', { n: libre, type: 'defausser' }), false);
  assert.equal(room.actCoup('p0', { n: couverte, type: 'defausser' }), false);
  assert.equal(room.actCoup('p0', { n: libre, type: 'merveille', merveille: 'sphinx' }), false);
  assert.equal(room.actCoup('p0', { n: libre, type: 'voler' }), false);
  assert.equal(room.actCoup('p0', { n: '3', type: 'defausser' }), false);
  g.decision = { type: 'progres', siege: 0 };
  assert.equal(room.actCoup('p0', { n: libre, type: 'defausser' }), false);
  assert.equal(S(0).pieces, 7);
});
