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
| Mise en ligne | Render est relié au dépôt GitHub **`https://github.com/StavyP/complots-server.git`**. L'utilisateur y dépose les fichiers **par l'interface web de GitHub** ; Render redéploie seul ; démarrage `node server.js`, port via `PORT` |
| Clients | Pages statiques sur IONOS (`public/<jeu>/`). L'URL du serveur est dans **`public/_commun/config.js`** (une ligne pour tous) |
| Sauvegarde d'avant fusion | `_backups/jeux-2026-09-24-avant-fusion/` : anciens `server.js` de chaque jeu (7wonders, incanGold, skyjo, traitres, Wavelength, complots) et ancien `server/jeux/` |

### ⚠️ Ne jamais pousser sur le dépôt GitHub depuis une session

Pousser = Render redéploie = les clients déjà en ligne (qui parlent l'ancien
protocole) cassent. L'utilisateur envoie serveur et clients **ensemble**.
Aucune session n'a les droits de toute façon ; ne pas chercher à les obtenir.

### Fichiers à envoyer sur GitHub

`server.js`, `package.json`, `package-lock.json`, `.gitignore`, `lib/`,
`jeux/`, `tests/` (facultatif). **Jamais `node_modules/`** (Render fait
`npm install`). Supprimer du dépôt les anciens fichiers qui n'existent plus
ici (ancien `server.js` monolithique de Complots, etc.).

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
| Skyjo | `/skyjo` | à refaire (règles, moteur, client) |
| Incan Gold | `/incan` | à refaire |
| Wavelength | `/wavelength` | à refaire |
| Traîtres à bord | `/traitres` | à refaire |
| 7 Wonders | `/7wonders` | à refaire |

Tant qu'un jeu n'est pas dans `jeux/index.js`, **son espace n'existe pas** :
son ancien client (qui vise l'ancien serveur) ne marche pas avec ce serveur.
→ Ne déployer ce serveur qu'une fois tous les jeux migrés, ou accepter
que les jeux non migrés soient hors service entre-temps.

## 4. Vérifié / pas vérifié

**Vérifié le 2026-09-25** (local, `PORT=3100 node server.js`) :
- `npm test` : 31/31 (Complots : 30 scénarios + fuzz 400 parties).
- Complots de bout en bout (Playwright, 3 navigateurs) : partie complète,
  F5 → retour à la table, abandon → victoire, revanche.
- `GET /` et `GET /salle/:code` depuis l'accueil (autre origine) : OK.

**Pas vérifié** : sur Render ; `npm install` sur Render (Node ≥ 18 exigé par
`engines`) ; tenue en charge.

## 5. À faire

- [ ] Migrer Skyjo, Incan Gold, Wavelength, Traîtres, 7 Wonders.
- [ ] Déploiement coordonné (GitHub + IONOS) quand tout est prêt.

## 6. Décisions de l'utilisateur — ne pas défaire

| Décision | Contexte |
|---|---|
| Fusionner les serveurs de 7wonders, complots, skyjo, incangold, traitres, wavelength en un seul | Demande du 2026-09-24 |
| Render déployé depuis le dépôt GitHub relié `StavyP/complots-server` | Réponse de l'utilisateur, 2026-09-24 |
| Chaque jeu garde **sa propre identité visuelle** (celle de sa boîte) ; seul l'accueil est cel-shaded | Réponse de l'utilisateur, 2026-09-24 |

---

## Journal

### 2026-09-25 — Création

- Serveur unique écrit (`lib/`, `jeux/index.js`), Complots migré et testé.
- Anciens serveurs sauvegardés dans `_backups/jeux-2026-09-24-avant-fusion/`.
- **Rien n'est déployé.**
