# Passation — Serveur unique des jeux (`server/`)

> Document de passation entre sessions. **À lire avant de toucher au code,
> à mettre à jour avant de terminer.** Voir le protocole dans le
> [CLAUDE.md](../CLAUDE.md) de l'espace de travail.
>
> Dernière mise à jour : **2026-09-25** (création : fusion des serveurs)

---

## 1. Ce qu'il faut savoir d'emblée

| | |
|---|---|
| Rôle | **Un seul** serveur Node (Express + Socket.IO) pour tous les jeux en ligne. Chaque jeu = un espace Socket.IO : `/complots`, `/skyjo`, `/incan`, `/wavelength`, `/traitres`, `/7wonders` |
| Hébergement | **Render**, `https://complots-server.onrender.com` (nom historique gardé : les clients déjà en ligne le connaissent) |
| Mise en ligne | Render est relié au dépôt GitHub **`https://github.com/StavyP/complots-server.git`** (branche `main`) ; tout push redéploie seul ; démarrage `node server.js`, port via `PORT` |
| Clients | Pages statiques sur IONOS (`public/<jeu>/`). L'URL du serveur est dans **`public/_commun/config.js`** (une ligne pour tous) |
| Sauvegarde d'avant fusion | `_backups/jeux-2026-09-24-avant-fusion/` : anciens `server.js` de chaque jeu (7wonders, incanGold, skyjo, traitres, Wavelength, complots) et ancien `server/jeux/` |

### Pousser après chaque mise à jour (consigne de l'utilisateur, 2026-09-25)

« Push le serveur mis à jour sur GitHub à chaque fois pour que je puisse voir
le rendu. » Procédure (l'espace n'est pas un dépôt git, on passe par un clone) :

1. `git clone https://github.com/StavyP/complots-server.git` dans le scratchpad.
2. Y copier `server.js`, `package.json`, `package-lock.json`, `.gitignore`,
   `HANDOVER.md`, `lib/`, `jeux/`, `tests/`, `outils/` — **jamais `node_modules/`**.
   (Le dossier `image/` du dépôt est un reste de l'ancien Complots : inutile, laissé.)
3. `npm test` dans `server/` avant de committer ; commit ; `git push origin main`
   (Git Credential Manager a déjà les droits).
4. Dire à l'utilisateur quels dossiers de `public/` envoyer en SFTP : un jeu
   migré ne marche en ligne qu'avec son nouveau client **et** `public/_commun/`.

Effet d'un push sur les jeux en ligne : les anciens clients des jeux non
migrés visent encore leurs anciens serveurs Render (`skijo-server`,
`incan-server`, `saboteur-server`…) et ne sont pas touchés. Seul l'ancien
client Complots (même adresse) ne marche plus tant que le nouveau n'est pas envoyé.

## 2. Architecture

- `server.js` : monte chaque jeu de `jeux/index.js`, route de santé `GET /`
  (JSON `{ ok, service, jeux: [{ id, salles }] }`, CORS `*` — l'accueil la
  sonde pour réveiller Render et compter les tables), `GET /salle/:code`
  (`{ ok, jeu }` ou 404 — « Rejoindre avec un code » de l'accueil).
- `lib/salles.js` — `monterJeu(io, jeu)` : **protocole commun** à tous les jeux :
  - client → serveur : `room:create {name}`, `room:join {code,name}`,
    `room:reconnect {code,playerId}`, `room:settings {…}`, `game:start`,
    `game:replay`, `room:leave`, puis les événements propres au jeu
    (`jeu.events` : `{ 'game:decide': 'decide', … }` → `room.decide(playerId, payload)` ;
    retour `false` → `game:rejected`).
  - serveur → client : `room:joined {roomCode, playerId}`, `game:state` (vue
    **personnelle** : `room.viewFor(playerId)`), `room:gone`, `error` (texte), `game:rejected`.
  - **Registre global des codes** : un code de 4 lettres est unique tous jeux
    confondus (sinon `/salle/:code` serait ambigu).
  - Diffusion : ni aux joueurs partis (`left`) ni aux déconnectés.
  - Ménage toutes les 30 min : salle sans activité depuis 6 h supprimée.
- `lib/salle.js` — classe **`Salle`**, base des nouveaux moteurs : joueurs
  (id, nom, socketId, connected, left), hôte, réglages, phases
  `lobby|play|ended`, journal (60), effets `fx` numérotés (16), minuterie
  (`setTimer(ms, fn)` + `timerInfo` envoyé au client), `viewFor(pid)`.
  Crochets à surcharger : `validateSettings`, `onStart` (renvoie un message
  d'erreur ou `null`), `onReset`, `gameView(pid)`, `onLeave`, `onConnectionChange`.
  Horloge injectable (`clock`) → moteurs testables sans attendre.
- `lib/outils.js` : `shuffle`, `realClock`, `makeCode`, `newPlayerId`, `cleanName`.
- `jeux/<id>.js` exporte `{ id, createRoom(code, opts), events }` (+ ce que
  les tests veulent). `jeux/complots.js` : moteur à pile de décisions, plus
  ancien, n'hérite pas de `Salle` mais a la même interface.

### Ajouter un jeu
1. `jeux/<id>.js` (classe qui étend `Salle`), l'ajouter dans `jeux/index.js`.
2. Tests `tests/<id>.test.js` (+ fuzz), `npm test`.
3. Client : `public/<dossier>/` avec `../_commun/config.js` puis
   `../_commun/table.js` (kit client commun, voir plus bas).
4. Fiche du jeu dans `accueil/src/lib/data.ts` (`server: '<id>'`).

### Kit client commun `public/_commun/table.js`
`Table.connect({ jeu, onState, onGone, onError, onStatus, onRejected })` :
connexion à l'espace, session (clé `taniere-session-<jeu>`, 3 h) → un F5
ramène à la table ; pseudo `boardgame_pseudo` du site ; lien de partage
`?salle=` ; `toast`, sons synthétisés (`sound('turn'|'coin'|…)`, clé
`taniere-son`), `fxRunner`. Le CSS du toast (`.table-toast`) est à fournir
par chaque jeu (identité visuelle propre). Complots n'utilise pas ce kit
(client écrit avant), il a sa propre version équivalente.

## 3. État actuel

| Jeu | Espace | État |
|---|---|---|
| Complots | `/complots` | **Fait** (moteur refondu le 2026-09-24, migré ici le 2026-09-25) |
| Skyjo | `/skyjo` | **Fait** le 2026-09-25 : `jeux/skyjo.js` (hérite de `Salle`), tests `skyjo.test.js` + fuzz, client `public/skyjo/` |
| Incan Gold | `/incan` | **Fait** le 2026-09-25 : `jeux/incan.js`, tests `incan.test.js` + fuzz, client `public/incanGold/` |
| Wavelength | `/wavelength` | **Fait** le 2026-09-25 : `jeux/wavelength.js` (+ `wavelength-cartes.js`), tests + fuzz, client `public/Wavelength/` |
| Traîtres à bord | `/traitres` | **Fait** le 2026-09-25 : `jeux/traitres.js`, tests + fuzz, client `public/traitres/` |
| 7 Wonders (édition 2020) | `/7wonders` | **Fait** le 2026-09-25 : `jeux/7wonders.js` (+ catalogue généré, noms), tests + fuzz, client `public/7wonders/` |
| 7 Wonders Duel | à créer | Demandé le 2026-09-25, pas commencé |

Tant qu'un jeu n'est pas dans `jeux/index.js`, son espace n'existe pas ici ;
son ancien client continue de viser son ancien serveur Render (voir §1).

## 4. Vérifié / pas vérifié

**Vérifié le 2026-09-25** (local, `PORT=3100 node server.js`) :
- `npm test` : 143/143 (Complots : 30 scénarios + fuzz 400 parties ; Skyjo :
  25 + fuzz 300 ; Incan Gold : 17 + fuzz 400 ; Wavelength : 20 + fuzz 400 ;
  Traîtres : 19 + fuzz 500 ; 7 Wonders : 26 + fuzz 150 ; avec déconnexions
  et départs).
- De bout en bout (3-4 navigateurs) : `public/<jeu>/_banc-essai/partie.py`
  pour skyjo, incanGold, Wavelength, traitres, 7wonders.
- Complots de bout en bout (Playwright, 3 navigateurs) : partie complète,
  F5 → retour à la table, abandon → victoire, revanche.
- `GET /` et `GET /salle/:code` depuis l'accueil (autre origine) : OK.
- `GET /donnees/:jeu` (données statiques d'un jeu, ex. cartes de 7 Wonders) : OK.

**Poussé le 2026-09-25** : commit `7803f7b` (Complots), puis Skyjo branché
(voir le journal pour le commit).

**Pas vérifié** : le redéploiement Render après ce push (à contrôler :
`GET https://complots-server.onrender.com/` doit lister les jeux) ; tenue en charge.

## 5. À faire

- [ ] 7 Wonders Duel (nouveau jeu à 2 joueurs).
- [ ] Ajouter l'interface de discussion au client Skyjo (le serveur la gère déjà).
- [ ] L'utilisateur doit envoyer en SFTP `public/complots/` + `public/_commun/`
      (l'ancien client Complots en ligne ne marche plus avec le serveur poussé),
      et `public/skyjo/`, `public/incanGold/`, `public/Wavelength/`,
      `public/traitres/`, `public/7wonders/` pour les nouveaux clients (les
      anciens visent encore leurs anciens serveurs). NB : la synchro SFTP de
      VS Code est automatique (voir CLAUDE.md) — c'est peut-être déjà fait.
- [ ] Render a mis longtemps à suivre les push le 2026-09-25 (resté un
      moment sur `7803f7b`, puis à jour jusqu'à Wavelength). Délai du
      redéploiement automatique ou déploiement manuel de l'utilisateur :
      inconnu. Si un push n'apparaît pas sur `GET /`, lui dire « Manual
      Deploy → Deploy latest commit ».

## 6. Décisions de l'utilisateur — ne pas défaire

| Décision | Contexte |
|---|---|
| Fusionner les serveurs de 7wonders, complots, skyjo, incangold, traitres, wavelength en un seul | Demande du 2026-09-24 |
| Render déployé depuis le dépôt GitHub relié `StavyP/complots-server` | Réponse de l'utilisateur, 2026-09-24 |
| **Pousser le serveur sur GitHub après chaque mise à jour**, tout sur **un seul serveur** | Demandes du 2026-09-25 |
| Chaque jeu garde **sa propre identité visuelle** (celle de sa boîte) ; seul l'accueil est cel-shaded | Réponse de l'utilisateur, 2026-09-24 |

---

## Journal

### 2026-09-25 — 7 Wonders (édition 2020) migré

- `jeux/7wonders.js`, `jeux/7wonders-catalogue.js` (GÉNÉRÉ par
  `outils/catalogue-2020.js`), `jeux/7wonders-noms.js`, route générique
  `GET /donnees/:jeu` (le module d'un jeu peut exporter `donnees`).
- `outils/` : scripts de génération de données (pas lancés au démarrage).

### 2026-09-25 — Traîtres à bord migré

- `jeux/traitres.js` + tests. Render bloqué sur le 1er commit (voir À faire).

### 2026-09-25 — Wavelength migré

- `jeux/wavelength.js` + `jeux/wavelength-cartes.js` + tests. Méthodes
  d'action utilisables au salon (`actTeam`) : `Salle` ne bloque rien, c'est
  au jeu de vérifier `this.started`.

### 2026-09-25 — Incan Gold migré ; discussion commune

- `jeux/incan.js` + tests. `Salle.chat` + événement `room:chat` (tous les jeux).

### 2026-09-25 — Skyjo migré

- `jeux/skyjo.js` + tests ; `tests/aide.js` (fausse horloge commune aux
  nouveaux tests). Voir `public/skyjo/HANDOVER.md` pour les règles.

### 2026-09-25 — Création

- Serveur unique écrit (`lib/`, `jeux/index.js`), Complots migré et testé.
- Anciens serveurs sauvegardés dans `_backups/jeux-2026-09-24-avant-fusion/`.
- Premier push sur GitHub (`7803f7b`), à la demande de l'utilisateur.
