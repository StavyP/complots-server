'use strict';
// duel-cartes.js — Données de 7 Wonders Duel (Bauza & Cathala, Repos 2015).
//
// Source : règle officielle française et aide de jeu (PDF de
// jeuxstrategieter.free.fr/7wonders_duel_complet.php), lues le 2026-09-25 :
// liste des cartes p. 18-19 (coûts, effets, chaînages), merveilles p. 17,
// structures des âges p. 20. Coûts des merveilles lus sur les cartes du
// « matériel » (Print & Play) du même site.
//
// Ressources : W bois, C argile, S pierre, G verre, P papyrus.
// Couleurs : brun, gris, bleu, vert, jaune, rouge, violet.
// Chaînage : `chaine` = symbole que la carte donne ; `depuis` = symbole qui
// la rend gratuite.

const RESSOURCES = { W: 'Bois', C: 'Argile', S: 'Pierre', G: 'Verre', P: 'Papyrus' };

// Symboles scientifiques : 6 paires sur les cartes vertes + la Loi (jeton).
const SYMBOLES = {
  sphere: 'Sphère armillaire',
  roue: 'Roue',
  cadran: 'Cadran solaire',
  mortier: 'Mortier',
  fil: 'Fil à plomb',
  plume: 'Plume',
  balance: 'Balance',
};

const CHAINES = {
  fer: 'Fer à cheval', epee: 'Épée', tour: 'Tour', cible: 'Cible', casque: 'Casque',
  livre: 'Livre', engrenage: 'Engrenage', lyre: 'Lyre', lampe: 'Lampe',
  masque: 'Masque', colonne: 'Colonne', lune: 'Lune', soleil: 'Soleil',
  goutte: 'Goutte', fronton: 'Fronton', amphore: 'Amphore', tonneau: 'Tonneau',
};

const c = (age, id, nom, couleur, cout, effet = {}, chaine = {}) => ({ id, nom, age, couleur, cout, ...effet, ...chaine });

const CARTES = [
  // ── Âge I (23) ────────────────────────────────────────────────────────────
  c(1, 'chantier', 'Chantier', 'brun', {}, { prod: 'W' }),
  c(1, 'exploitation', 'Exploitation', 'brun', { pieces: 1 }, { prod: 'W' }),
  c(1, 'bassin-argileux', 'Bassin argileux', 'brun', {}, { prod: 'C' }),
  c(1, 'cavite', 'Cavité', 'brun', { pieces: 1 }, { prod: 'C' }),
  c(1, 'gisement', 'Gisement', 'brun', {}, { prod: 'S' }),
  c(1, 'mine', 'Mine', 'brun', { pieces: 1 }, { prod: 'S' }),
  c(1, 'verrerie', 'Verrerie', 'gris', { pieces: 1 }, { prod: 'G' }),
  c(1, 'presse', 'Presse', 'gris', { pieces: 1 }, { prod: 'P' }),
  c(1, 'tour-de-garde', 'Tour de garde', 'rouge', {}, { boucliers: 1 }),
  c(1, 'atelier', 'Atelier', 'vert', { res: 'P' }, { sci: 'fil', pv: 1 }),
  c(1, 'apothicaire', 'Apothicaire', 'vert', { res: 'G' }, { sci: 'roue', pv: 1 }),
  c(1, 'depot-pierre', 'Dépôt de pierre', 'jaune', { pieces: 3 }, { commerce: 'S' }),
  c(1, 'depot-argile', 'Dépôt d’argile', 'jaune', { pieces: 3 }, { commerce: 'C' }),
  c(1, 'depot-bois', 'Dépôt de bois', 'jaune', { pieces: 3 }, { commerce: 'W' }),
  c(1, 'ecuries', 'Écuries', 'rouge', { res: 'W' }, { boucliers: 1 }, { chaine: 'fer' }),
  c(1, 'caserne', 'Caserne', 'rouge', { res: 'C' }, { boucliers: 1 }, { chaine: 'epee' }),
  c(1, 'palissade', 'Palissade', 'rouge', { pieces: 2 }, { boucliers: 1 }, { chaine: 'tour' }),
  c(1, 'scriptorium', 'Scriptorium', 'vert', { pieces: 2 }, { sci: 'plume' }, { chaine: 'livre' }),
  c(1, 'officine', 'Officine', 'vert', { pieces: 2 }, { sci: 'mortier' }, { chaine: 'engrenage' }),
  c(1, 'theatre', 'Théâtre', 'bleu', {}, { pv: 3 }, { chaine: 'masque' }),
  c(1, 'autel', 'Autel', 'bleu', {}, { pv: 3 }, { chaine: 'lune' }),
  c(1, 'bains', 'Bains', 'bleu', { res: 'S' }, { pv: 3 }, { chaine: 'goutte' }),
  c(1, 'taverne', 'Taverne', 'jaune', {}, { gain: 4 }, { chaine: 'amphore' }),

  // ── Âge II (23) ───────────────────────────────────────────────────────────
  c(2, 'scierie', 'Scierie', 'brun', { pieces: 2 }, { prod: 'WW' }),
  c(2, 'briqueterie', 'Briqueterie', 'brun', { pieces: 2 }, { prod: 'CC' }),
  c(2, 'carriere', 'Carrière', 'brun', { pieces: 2 }, { prod: 'SS' }),
  c(2, 'soufflerie', 'Soufflerie', 'gris', {}, { prod: 'G' }),
  c(2, 'sechoir', 'Séchoir', 'gris', {}, { prod: 'P' }),
  c(2, 'muraille', 'Muraille', 'rouge', { res: 'SS' }, { boucliers: 2 }),
  c(2, 'forum', 'Forum', 'jaune', { pieces: 3, res: 'C' }, { choix: 'GP' }),
  c(2, 'caravanserail', 'Caravansérail', 'jaune', { pieces: 2, res: 'GP' }, { choix: 'WCS' }),
  c(2, 'douanes', 'Douanes', 'jaune', { pieces: 4 }, { commerce: 'GP' }),
  c(2, 'tribunal', 'Tribunal', 'bleu', { res: 'WWG' }, { pv: 5 }),
  c(2, 'haras', 'Haras', 'rouge', { res: 'CW' }, { boucliers: 1 }, { depuis: 'fer' }),
  c(2, 'baraquements', 'Baraquements', 'rouge', { pieces: 3 }, { boucliers: 1 }, { depuis: 'epee' }),
  c(2, 'champ-de-tir', 'Champ de tir', 'rouge', { res: 'SWP' }, { boucliers: 2 }, { chaine: 'cible' }),
  c(2, 'place-d-armes', 'Place d’armes', 'rouge', { res: 'CCG' }, { boucliers: 2 }, { chaine: 'casque' }),
  c(2, 'bibliotheque', 'Bibliothèque', 'vert', { res: 'SWG' }, { sci: 'plume', pv: 2 }, { depuis: 'livre' }),
  c(2, 'dispensaire', 'Dispensaire', 'vert', { res: 'CCS' }, { sci: 'mortier', pv: 2 }, { depuis: 'engrenage' }),
  c(2, 'ecole', 'École', 'vert', { res: 'WPP' }, { sci: 'roue', pv: 1 }, { chaine: 'lyre' }),
  c(2, 'laboratoire', 'Laboratoire', 'vert', { res: 'WGG' }, { sci: 'fil', pv: 1 }, { chaine: 'lampe' }),
  c(2, 'statue', 'Statue', 'bleu', { res: 'CC' }, { pv: 4 }, { depuis: 'masque', chaine: 'colonne' }),
  c(2, 'temple', 'Temple', 'bleu', { res: 'WP' }, { pv: 4 }, { depuis: 'lune', chaine: 'soleil' }),
  c(2, 'aqueduc', 'Aqueduc', 'bleu', { res: 'SSS' }, { pv: 5 }, { depuis: 'goutte' }),
  c(2, 'rostres', 'Rostres', 'bleu', { res: 'SW' }, { pv: 4 }, { chaine: 'fronton' }),
  c(2, 'brasserie', 'Brasserie', 'jaune', {}, { gain: 6 }, { chaine: 'tonneau' }),

  // ── Âge III (20) ──────────────────────────────────────────────────────────
  c(3, 'arsenal', 'Arsenal', 'rouge', { res: 'CCCWW' }, { boucliers: 3 }),
  c(3, 'pretoire', 'Prétoire', 'rouge', { pieces: 8 }, { boucliers: 3 }),
  c(3, 'academie', 'Académie', 'vert', { res: 'SWGG' }, { sci: 'cadran', pv: 3 }),
  c(3, 'etude', 'Étude', 'vert', { res: 'WWGP' }, { sci: 'cadran', pv: 3 }),
  c(3, 'chambre-de-commerce', 'Chambre de commerce', 'jaune', { res: 'PP' }, { parCarte: { couleurs: ['gris'], pieces: 3 }, pv: 3 }),
  c(3, 'port', 'Port', 'jaune', { res: 'WGP' }, { parCarte: { couleurs: ['brun'], pieces: 2 }, pv: 3 }),
  c(3, 'armurerie', 'Armurerie', 'jaune', { res: 'SSG' }, { parCarte: { couleurs: ['rouge'], pieces: 1 }, pv: 3 }),
  c(3, 'palace', 'Palace', 'bleu', { res: 'CSWGG' }, { pv: 7 }),
  c(3, 'hotel-de-ville', 'Hôtel de ville', 'bleu', { res: 'SSSWW' }, { pv: 7 }),
  c(3, 'obelisque', 'Obélisque', 'bleu', { res: 'SSG' }, { pv: 5 }),
  c(3, 'fortifications', 'Fortifications', 'rouge', { res: 'SSCP' }, { boucliers: 2 }, { depuis: 'tour' }),
  c(3, 'atelier-de-siege', 'Atelier de siège', 'rouge', { res: 'WWWG' }, { boucliers: 2 }, { depuis: 'cible' }),
  c(3, 'cirque', 'Cirque', 'rouge', { res: 'CCSS' }, { boucliers: 2 }, { depuis: 'casque' }),
  c(3, 'universite', 'Université', 'vert', { res: 'CGP' }, { sci: 'sphere', pv: 2 }, { depuis: 'lyre' }),
  c(3, 'observatoire', 'Observatoire', 'vert', { res: 'SPP' }, { sci: 'sphere', pv: 2 }, { depuis: 'lampe' }),
  c(3, 'jardins', 'Jardins', 'bleu', { res: 'CCWW' }, { pv: 6 }, { depuis: 'colonne' }),
  c(3, 'pantheon', 'Panthéon', 'bleu', { res: 'CWPP' }, { pv: 6 }, { depuis: 'soleil' }),
  c(3, 'senat', 'Sénat', 'bleu', { res: 'CCSP' }, { pv: 5 }, { depuis: 'fronton' }),
  c(3, 'phare', 'Phare', 'jaune', { res: 'CCG' }, { parCarte: { couleurs: ['jaune'], pieces: 1 }, pv: 3 }, { depuis: 'amphore' }),
  c(3, 'arene', 'Arène', 'jaune', { res: 'CSW' }, { parMerveille: 2, pv: 3 }, { depuis: 'tonneau' }),

  // ── Guildes (7 ; 3 tirées au hasard rejoignent l'Âge III) ──────────────────
  // `guilde.couleurs` : pièces à la construction ET PV en fin de partie, 1 par
  // carte de ces couleurs dans la cité qui en a le plus (les deux couleurs
  // comptées ensemble pour les Armateurs : une seule cité choisie).
  c('G', 'guilde-commercants', 'Guilde des commerçants', 'violet', { res: 'CWGP' }, { guilde: { couleurs: ['jaune'] } }),
  c('G', 'guilde-armateurs', 'Guilde des armateurs', 'violet', { res: 'CSGP' }, { guilde: { couleurs: ['brun', 'gris'] } }),
  c('G', 'guilde-batisseurs', 'Guilde des bâtisseurs', 'violet', { res: 'SSCWG' }, { guilde: { merveilles: 2 } }),
  c('G', 'guilde-magistrats', 'Guilde des magistrats', 'violet', { res: 'WWCP' }, { guilde: { couleurs: ['bleu'] } }),
  c('G', 'guilde-scientifiques', 'Guilde des scientifiques', 'violet', { res: 'CCWW' }, { guilde: { couleurs: ['vert'] } }),
  c('G', 'guilde-usuriers', 'Guilde des usuriers', 'violet', { res: 'SSWW' }, { guilde: { tresor: true } }),
  c('G', 'guilde-tacticiens', 'Guilde des tacticiens', 'violet', { res: 'SSCP' }, { guilde: { couleurs: ['rouge'] } }),
];

// ── Merveilles (12) ──────────────────────────────────────────────────────────
// gain : pièces de la banque · perte : pièces retirées à l'adversaire ·
// rejouer · detruire : couleur d'une carte adverse à défausser ·
// mausolee : construire gratuitement une carte de la défausse ·
// bibliotheque : 3 jetons Progrès écartés, en garder 1 · choix : production.
const m = (id, nom, cout, effet) => ({ id, nom, cout, ...effet });
const MERVEILLES = [
  m('via-appia', 'La Via Appia', 'PCCSS', { gain: 3, perte: 3, rejouer: true, pv: 3 }),
  m('circus-maximus', 'Le Circus Maximus', 'GWSS', { detruire: 'gris', boucliers: 1, pv: 3 }),
  m('colosse', 'Le Colosse', 'GCCC', { boucliers: 2, pv: 3 }),
  m('grande-bibliotheque', 'La Grande Bibliothèque', 'PGWWW', { bibliotheque: true, pv: 4 }),
  m('grand-phare', 'Le Grand Phare', 'PPSW', { choix: 'WCS', pv: 4 }),
  m('jardins-suspendus', 'Les Jardins suspendus', 'PGWW', { gain: 6, rejouer: true, pv: 3 }),
  m('mausolee', 'Le Mausolée', 'PGGCC', { mausolee: true, pv: 2 }),
  m('piree', 'Le Pirée', 'CSWW', { choix: 'GP', rejouer: true, pv: 2 }),
  m('pyramides', 'Les Pyramides', 'PSSS', { pv: 9 }),
  m('sphinx', 'Le Sphinx', 'GGCS', { rejouer: true, pv: 6 }),
  m('statue-de-zeus', 'La Statue de Zeus', 'PPCWS', { detruire: 'brun', boucliers: 1, pv: 3 }),
  m('temple-d-artemis', 'Le Temple d’Artémis', 'PGSW', { gain: 12, rejouer: true, pv: 0 }),
];

// Première partie (règle p. 7) : merveilles imposées, sans sélection.
const DECOUVERTE = [
  ['pyramides', 'grand-phare', 'temple-d-artemis', 'statue-de-zeus'],
  ['circus-maximus', 'piree', 'via-appia', 'colosse'],
];

// ── Jetons Progrès (10 ; 5 sur le plateau) ───────────────────────────────────
const PROGRES = {
  agriculture: { nom: 'Agriculture', texte: '6 pièces tout de suite ; 4 points de victoire.' },
  architecture: { nom: 'Architecture', texte: 'Tes prochaines Merveilles coûtent 2 ressources de moins.' },
  economie: { nom: 'Économie', texte: 'Tu récupères l’argent que ton adversaire dépense en commerce.' },
  loi: { nom: 'Loi', texte: 'Un symbole scientifique (la balance).' },
  maconnerie: { nom: 'Maçonnerie', texte: 'Tes prochains bâtiments bleus coûtent 2 ressources de moins.' },
  mathematiques: { nom: 'Mathématiques', texte: '3 points par jeton Progrès possédé (celui-ci compris).' },
  philosophie: { nom: 'Philosophie', texte: '7 points de victoire.' },
  strategie: { nom: 'Stratégie', texte: 'Tes prochains bâtiments rouges ont 1 bouclier de plus.' },
  theologie: { nom: 'Théologie', texte: 'Tes prochaines Merveilles ont toutes l’effet « Rejouer ».' },
  urbanisme: { nom: 'Urbanisme', texte: '6 pièces tout de suite ; 4 pièces à chaque construction gratuite par chaînage.' },
};

// ── Structures des âges (aide de jeu p. 20) ─────────────────────────────────
// Rangées de haut (loin des joueurs) en bas (accessibles au départ).
// Chaque rangée : [abscisses en demi-largeurs de carte, face visible ?].
// Une carte est recouverte par celles de la rangée suivante à ±1.
const rangee = (n) => Array.from({ length: n }, (_, i) => -(n - 1) + 2 * i);
const STRUCTURES = {
  1: [[rangee(2), true], [rangee(3), false], [rangee(4), true], [rangee(5), false], [rangee(6), true]],
  2: [[rangee(6), true], [rangee(5), false], [rangee(4), true], [rangee(3), false], [rangee(2), true]],
  3: [[rangee(2), true], [rangee(3), false], [rangee(4), true], [[-2, 2], false], [rangee(4), true], [rangee(3), false], [rangee(2), true]],
};

module.exports = { RESSOURCES, SYMBOLES, CHAINES, CARTES, MERVEILLES, DECOUVERTE, PROGRES, STRUCTURES };
