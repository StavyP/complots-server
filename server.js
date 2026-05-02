const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── State ────────────────────────────────────────────────────────────────────
const rooms = {};

// Dictionnaire complet des personnages
const ALL_CHARACTERS = {
  // Complots 1
  'Duc':            { icon: '♛', type: 'classic',   short: 'Taxes · Bloque aide étrangère' },
  'Assassin':       { icon: '☽', type: 'classic',   short: 'Assassine pour 3 pièces' },
  'Comtesse':       { icon: '❦', type: 'classic',   short: 'Bloque l\'Assassin/Bourreau' },
  'Capitaine':      { icon: '⚓', type: 'classic',   short: 'Vole 2 pièces · Bloque Vol' },
  'Ambassadeur':    { icon: '⚜', type: 'classic',   short: 'Échange cartes · Bloque Vol' },
  'Inquisiteur':    { icon: '⚖', type: 'classic',   short: 'Regarde/Échange · Bloque Vol' },
  // Complots 2
  'Espion':         { icon: '👁', type: 'complots2', short: 'Regarde 1 carte · Vole 1 pièce' },
  'Pape':           { icon: '👑', type: 'complots2', short: 'Prend 1 pièce à chaque joueur' },
  'Justicier':      { icon: '⚖', type: 'complots2', short: 'Vole 2 pièces · Bloque Vol' },
  'Ursuline':       { icon: '⛪', type: 'complots2', short: 'Prend 3 au trésor · Donne 1 à cible' },
  'Illusionniste':  { icon: '🎩', type: 'complots2', short: 'Prend 4 pièces · Bloque aide' },
  'Bourreau':       { icon: '⛏', type: 'complots2', short: 'Assassine pour 3 pièces' },
  'Maître Chanteur':{ icon: '📜', type: 'complots2', short: 'Force la cible à payer 3 ou mourir' },
  'Croque Mort':    { icon: '⚰️', type: 'complots2', short: 'Prend l\'or du mort · Bloque assassin' },
  'Sorcière':       { icon: '🔮', type: 'complots2', short: 'PASSIF : reçoit 5 pièces quand révélée' },
  'Duchesse':       { icon: '♛', type: 'complots2', short: 'Taxes · Bloque aide étrangère' },
};

// Personnages valides par action (pour les contestations)
const ACTION_VALID_CHARS = {
  'tax':        ['Duc', 'Duchesse'],
  'steal':      ['Capitaine', 'Justicier'],
  'assassinate':['Assassin', 'Bourreau'],
  'exchange':   ['Ambassadeur', 'Inquisiteur'],
  'spy':        ['Espion'],
  'tax_all':    ['Pape'],
  'tithe':      ['Ursuline'],
  'extort4':    ['Illusionniste'],
  'blackmail':  ['Maître Chanteur'],
};

// Actions pouvant être bloquées et par quel(s) personnage(s)
const BLOCKABLE_BY = {
  'foreign_aid': ['Duc', 'Duchesse', 'Illusionniste'],
  'steal':       ['Capitaine', 'Ambassadeur', 'Inquisiteur', 'Justicier'],
  'assassinate': ['Comtesse', 'Croque Mort'],
  'spy':         [],
  'tax':         [],
  'tax_all':     [],
  'tithe':       [],
  'extort4':     [],
  'blackmail':   [],
  'exchange':    [],
};

// Actions qui NE PEUVENT PAS être contestées (pas de claim de personnage)
const NON_CONTESTABLE = ['income', 'coup', 'foreign_aid'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildDeck(playerCount, roster) {
  const times = playerCount >= 7 ? 4 : 3;
  const deck = [];
  roster.forEach(c => { for (let i = 0; i < times; i++) deck.push(c); });
  shuffle(deck);
  return deck;
}

function makeCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function alivePlayers(room) {
  return room.players.filter(p => !p.eliminated);
}

function broadcast(room) {
  room.players.forEach(p => {
    io.to(p.socketId).emit('game:state', buildView(room, p.id));
  });
}

function buildView(room, playerId) {
  return {
    roomCode: room.code,
    host: room.host,
    phase: room.phase,
    settings: room.settings,
    timerDuration: room.timerDuration,
    currentPlayerId: room.currentPlayerId,
    treasury: room.treasury,
    log: room.log,
    pendingAction: room.pendingAction,
    challengeCtx: room.challengeCtx,
    timerEnd: room.timerEnd,
    pickCtx: room.pickCtx
      ? { type: room.pickCtx.type, playerId: room.pickCtx.playerId, options: room.pickCtx.playerId === playerId ? room.pickCtx.options : null }
      : null,
    exchangeCtx: room.exchangeCtx && room.exchangeCtx.playerId === playerId ? room.exchangeCtx : null,
    // Espion : révélation privée uniquement pour l'espion
    spyCtx: room.spyCtx && room.spyCtx.spyId === playerId ? room.spyCtx : (room.spyCtx ? { spyId: room.spyCtx.spyId } : null),
    // Maître Chanteur : partagé (la cible doit pouvoir répondre)
    blackmailCtx: room.blackmailCtx || null,
    // Croque Mort : partagé pour la fenêtre de réclamation
    croqueMortCtx: room.croqueMortCtx || null,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      eliminated: p.eliminated,
      cardCount: p.hand.length,
      hand: p.id === playerId ? p.hand : null,
      revealed: p.revealed,
      hasPassed: room.passedPlayers.includes(p.id)
    })),
    winnerId: room.winnerId,
    started: room.started,
  };
}

function addLog(room, msg) {
  room.log.unshift(msg);
  if (room.log.length > 40) room.log.pop();
}

function clearRoomTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.timerEnd = null;
}

function nextTurn(room) {
  clearRoomTimer(room);
  room.phase = 'action';
  room.pendingAction = null;
  room.challengeCtx = null;
  room.pickCtx = null;
  room.exchangeCtx = null;
  room.spyCtx = null;
  room.blackmailCtx = null;
  room.croqueMortCtx = null;
  room.passedPlayers = [];

  if (checkWin(room)) return;

  const alive = alivePlayers(room);
  const currentIdx = alive.findIndex(p => p.id === room.currentPlayerId);
  const next = alive[(currentIdx + 1) % alive.length];
  room.currentPlayerId = next.id;
  broadcast(room);
}

function checkWin(room) {
  const alive = alivePlayers(room);
  if (alive.length === 1) {
    room.phase = 'ended';
    room.winnerId = alive[0].id;
    addLog(room, `🏆 ${alive[0].name} remporte la partie !`);
    broadcast(room);
    return true;
  }
  return false;
}

function playerById(room, id) {
  return room.players.find(p => p.id === id);
}

function loseCard(room, playerId, cardIndex, cb) {
  clearRoomTimer(room);
  const p = playerById(room, playerId);

  if (p.hand.length === 0) {
    if (!p.eliminated) {
      p.eliminated = true;
      addLog(room, `💀 ${p.name} est éliminé.`);
    }
    if (cb) cb();
    return;
  }

  if (p.hand.length === 1 || cardIndex !== undefined) {
    const idx = cardIndex ?? 0;
    const card = p.hand.splice(idx, 1)[0];
    p.revealed.push(card);
    addLog(room, `👁 ${p.name} révèle et perd : ${card}.`);

    // ── Passif Sorcière : reçoit 5 pièces quand sa carte est révélée ──
    if (card === 'Sorcière') {
      const bonus = Math.min(5, room.treasury);
      p.coins += bonus;
      room.treasury -= bonus;
      addLog(room, `🔮 La Sorcière de ${p.name} se déchaîne : +${bonus} pièce(s) !`);
    }

    if (p.hand.length === 0) {
      p.eliminated = true;
      addLog(room, `💀 ${p.name} est éliminé.`);
    }

    // ── Passif Croque Mort : fenêtre de réclamation après élimination ──
    if (p.eliminated && p.coins > 0 && room.settings.roster.includes('Croque Mort')) {
      const inheritedCoins = p.coins;
      p.coins = 0;
      room.croqueMortCtx = {
        deceasedName: p.name,
        coins: inheritedCoins,
        cb,
      };
      room.passedPlayers = [];
      room.phase = 'croque_mort';
      const duration = Math.min(room.settings.turnDuration * 1000, 15000);
      room.timerDuration = duration;
      room.timerEnd = Date.now() + duration;
      room.timer = setTimeout(() => {
        clearRoomTimer(room);
        // Personne n'a réclamé → pièces au trésor
        room.treasury += room.croqueMortCtx?.coins || 0;
        addLog(room, `⚰️ L'héritage de ${p.name} retourne au trésor.`);
        const savedCb = room.croqueMortCtx?.cb;
        room.croqueMortCtx = null;
        if (savedCb) savedCb();
      }, duration);
      broadcast(room);
      return;
    }

    if (cb) cb();
    return;
  }

  room.phase = 'pick';
  room.pickCtx = { playerId, cb, options: p.hand.map((c, i) => ({ card: c, index: i })) };
  broadcast(room);
}

function resolveAction(room) {
  clearRoomTimer(room);
  const pa = room.pendingAction;
  const actor = playerById(room, pa.actorId);
  const target = pa.targetId ? playerById(room, pa.targetId) : null;

  switch (pa.id) {
    case 'income':
      actor.coins += 1; room.treasury -= 1;
      addLog(room, `💰 ${actor.name} prend 1 pièce (revenu).`);
      nextTurn(room);
      break;

    case 'foreign_aid':
      actor.coins += 2; room.treasury -= 2;
      addLog(room, `💰 ${actor.name} reçoit l'aide étrangère (+2 pièces).`);
      nextTurn(room);
      break;

    case 'tax':
      actor.coins += 3; room.treasury -= 3;
      addLog(room, `💰 ${actor.name} collecte les taxes (+3 pièces).`);
      nextTurn(room);
      break;

    case 'steal': {
      const stolen = Math.min(2, target.coins);
      target.coins -= stolen; actor.coins += stolen;
      addLog(room, `⚓ ${actor.name} vole ${stolen} pièce(s) à ${target.name}.`);
      nextTurn(room);
      break;
    }

    case 'assassinate':
      actor.coins -= 3; room.treasury += 3;
      addLog(room, `☽ ${actor.name} assassine ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
      break;

    case 'exchange': {
      const drawn = [room.deck.pop(), room.deck.pop()].filter(Boolean);
      room.exchangeCtx = { playerId: actor.id, options: [...actor.hand, ...drawn], keepCount: actor.hand.length };
      room.phase = 'exchange';
      addLog(room, `⚜ ${actor.name} échange ses cartes.`);
      broadcast(room);
      break;
    }

    case 'coup':
      actor.coins -= 7; room.treasury += 7;
      addLog(room, `⚔ ${actor.name} lance un coup d'état contre ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
      break;

    // ── COMPLOTS 2 ────────────────────────────────────────────────────────────

    case 'spy': {
      // Regarde 1 carte aléatoire de la cible + vole 1 pièce
      if (!target || target.hand.length === 0) { nextTurn(room); break; }
      const revealedCard = target.hand[Math.floor(Math.random() * target.hand.length)];
      const stolenSpy = Math.min(1, target.coins);
      target.coins -= stolenSpy;
      actor.coins += stolenSpy;
      addLog(room, `👁 ${actor.name} (Espion) espionne ${target.name} et vole ${stolenSpy} pièce(s).`);
      room.spyCtx = { spyId: actor.id, card: revealedCard, targetName: target.name };
      room.phase = 'spy_reveal';
      const spyDuration = room.settings.turnDuration * 1000;
      room.timerDuration = spyDuration;
      room.timerEnd = Date.now() + spyDuration;
      room.timer = setTimeout(() => {
        clearRoomTimer(room);
        room.spyCtx = null;
        nextTurn(room);
      }, spyDuration);
      broadcast(room);
      break;
    }

    case 'tax_all': {
      // Prend 1 pièce à chaque autre joueur vivant
      let total = 0;
      alivePlayers(room).forEach(p => {
        if (p.id !== actor.id && p.coins > 0) {
          p.coins -= 1;
          total += 1;
        }
      });
      actor.coins += total;
      addLog(room, `👑 ${actor.name} (Pape) prélève 1 pièce à chaque joueur (+${total} pièces).`);
      nextTurn(room);
      break;
    }

    case 'tithe': {
      // Prend 3 au trésor, donne 1 à la cible (net: acteur +2, cible +1)
      const availTithe = Math.min(3, room.treasury);
      actor.coins += availTithe;
      room.treasury -= availTithe;
      if (target && availTithe >= 1) {
        actor.coins -= 1;
        target.coins += 1;
        addLog(room, `⛪ ${actor.name} (Ursuline) prend 3 au trésor et donne 1 à ${target.name}.`);
      } else {
        addLog(room, `⛪ ${actor.name} (Ursuline) prend ${availTithe} pièce(s) au trésor.`);
      }
      nextTurn(room);
      break;
    }

    case 'extort4': {
      // Prend 4 pièces au trésor
      const avail4 = Math.min(4, room.treasury);
      actor.coins += avail4; room.treasury -= avail4;
      addLog(room, `🎩 ${actor.name} (Illusionniste) prend ${avail4} pièces au trésor.`);
      nextTurn(room);
      break;
    }

    case 'blackmail': {
      // Cible : payer 3 pièces ou perdre une carte
      addLog(room, `📜 ${actor.name} (Maître Chanteur) fait chanter ${target.name} !`);
      room.blackmailCtx = { actorId: actor.id, targetId: target.id };
      room.phase = 'blackmail_response';
      const bmDuration = room.settings.turnDuration * 1000;
      room.timerDuration = bmDuration;
      room.timerEnd = Date.now() + bmDuration;
      room.timer = setTimeout(() => {
        clearRoomTimer(room);
        const t = playerById(room, room.blackmailCtx?.targetId);
        addLog(room, `⏳ ${t?.name || 'La cible'} n'a pas répondu — résistance forcée !`);
        const ctx = room.blackmailCtx;
        room.blackmailCtx = null;
        room.pendingAction = null;
        if (t) loseCard(room, t.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
        else nextTurn(room);
      }, bmDuration);
      broadcast(room);
      break;
    }

    default:
      nextTurn(room);
  }
}

// ── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('room:create', ({ name }) => {
    const code = makeCode();
    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    rooms[code] = {
      code,
      host: playerId,
      started: false,
      phase: 'lobby',
      settings: {
        turnDuration: 10,
        type: 'classic',
        preset: '1',
        roster: ['Duc', 'Assassin', 'Comtesse', 'Capitaine', 'Ambassadeur']
      },
      timerDuration: 10000,
      players: [{ id: playerId, name, socketId: socket.id, hand: [], revealed: [], coins: 0, eliminated: false }],
      deck: [],
      treasury: 0,
      currentPlayerId: null,
      log: [],
      pendingAction: null,
      challengeCtx: null,
      passedPlayers: [],
      pickCtx: null,
      exchangeCtx: null,
      spyCtx: null,
      blackmailCtx: null,
      croqueMortCtx: null,
      winnerId: null,
      timer: null,
      timerEnd: null,
    };
    socket.join(code);
    socket.data = { roomCode: code, playerId };
    socket.emit('room:joined', { roomCode: code, playerId });
    broadcast(rooms[code]);
  });

  socket.on('room:join', ({ code, name }) => {
    code = code.toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit('error', 'Salle introuvable.');
    if (room.started) return socket.emit('error', 'La partie a déjà commencé.');
    if (room.players.length >= 6) return socket.emit('error', 'La salle est pleine (6 max).');

    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    room.players.push({ id: playerId, name, socketId: socket.id, hand: [], revealed: [], coins: 0, eliminated: false });
    socket.join(code);
    socket.data = { roomCode: code, playerId };
    socket.emit('room:joined', { roomCode: code, playerId });
    broadcast(room);
  });

  socket.on('room:settings', (settings) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (room && room.host === playerId && !room.started) {
      room.settings.turnDuration = Math.max(5, Math.min(60, settings.turnDuration));
      room.settings.type = settings.type;
      room.settings.preset = settings.preset;
      room.settings.roster = settings.roster;
      broadcast(room);
    }
  });

  socket.on('game:start', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.host !== playerId) return;
    if (room.players.length < 3) return socket.emit('error', 'Il faut au moins 3 joueurs.');

    room.deck = buildDeck(room.players.length, room.settings.roster);
    room.treasury = 50;
    room.players.forEach(p => {
      p.hand = [room.deck.pop(), room.deck.pop()];
      p.coins = 2; p.eliminated = false; p.revealed = [];
      room.treasury -= 2;
    });
    room.currentPlayerId = room.players[0].id;
    room.started = true;
    room.phase = 'action';
    room.log = ['🎲 La partie commence !'];
    broadcast(room);
  });

  socket.on('action:do', ({ actionId, targetId }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'action' || room.currentPlayerId !== playerId) return;

    const actor = playerById(room, playerId);
    const target = targetId ? playerById(room, targetId) : null;

    if (actionId === 'coup' && actor.coins < 7) return;
    if (actionId === 'assassinate' && actor.coins < 3) return;
    if (actionId === 'blackmail' && actor.coins < 0) return; // pas de coût
    if (actor.coins >= 10 && actionId !== 'coup') return socket.emit('error', 'Coup d\'état obligatoire (10+ pièces).');

    // Calculer les bloqueurs disponibles filtrés par le roster actuel
    const blockableChars = (BLOCKABLE_BY[actionId] || []).filter(c => room.settings.roster.includes(c));
    const contestable = !NON_CONTESTABLE.includes(actionId);

    room.pendingAction = {
      id: actionId,
      actorId: playerId,
      targetId: targetId || null,
      blockableBy: blockableChars,
      contestable,
    };

    const uncontestable = ['income', 'coup'];
    if (uncontestable.includes(actionId)) {
      return resolveAction(room);
    }

    room.phase = 'challenge';
    room.passedPlayers = [playerId];
    addLog(room, `⚡ ${actor.name} déclare : ${actionId}${target ? ' → ' + target.name : ''}`);

    const duration = room.settings.turnDuration * 1000;
    room.timerDuration = duration;
    room.timerEnd = Date.now() + duration;
    room.timer = setTimeout(() => { resolveAction(room); }, duration);

    broadcast(room);
  });

  socket.on('challenge:pass', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || (room.phase !== 'challenge' && room.phase !== 'block_challenge')) return;

    if (!room.passedPlayers.includes(playerId)) {
      room.passedPlayers.push(playerId);
      const alive = alivePlayers(room).length;

      if (room.passedPlayers.length >= alive) {
        if (room.phase === 'challenge') resolveAction(room);
        else if (room.phase === 'block_challenge') {
          clearRoomTimer(room);
          addLog(room, `🛡 Blocage accepté. Action annulée.`);
          room.pendingAction = null;
          room.challengeCtx = null;
          nextTurn(room);
        }
      } else {
        broadcast(room);
      }
    }
  });

  socket.on('challenge:contest', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'challenge') return;

    clearRoomTimer(room);
    const challenger = playerById(room, playerId);
    const actor = playerById(room, room.pendingAction.actorId);

    // Vérifier si l'acteur possède bien un personnage valide pour cette action
    const validChars = ACTION_VALID_CHARS[room.pendingAction.id] || [];
    const validChar = validChars.find(c => actor.hand.includes(c));

    if (validChar) {
      // Le contestataire avait tort
      addLog(room, `❌ ${challenger.name} se trompe ! ${actor.name} avait bien le : ${validChar}.`);
      const idx = actor.hand.indexOf(validChar);
      actor.hand.splice(idx, 1);
      room.deck.push(validChar);
      shuffle(room.deck);
      actor.hand.push(room.deck.pop());
      loseCard(room, challenger.id, undefined, () => resolveAction(room));
    } else {
      addLog(room, `🚨 MENTEUR ! ${challenger.name} démasque ${actor.name}. Action annulée.`);
      loseCard(room, actor.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
    }
  });

  socket.on('challenge:block', ({ blockChar }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'challenge') return;

    clearRoomTimer(room);
    const blocker = playerById(room, playerId);
    const actor = playerById(room, room.pendingAction.actorId);

    addLog(room, `🛡 ${blocker.name} bloque avec ${blockChar} !`);

    room.challengeCtx = { blockerId: playerId, blockChar, originalAction: room.pendingAction };
    room.pendingAction = { ...room.pendingAction, actorId: playerId };
    room.phase = 'block_challenge';

    // Seul l'acteur original peut contester le bloc — les autres passent d'office
    room.passedPlayers = alivePlayers(room).filter(p => p.id !== actor.id).map(p => p.id);

    const duration = room.settings.turnDuration * 1000;
    room.timerDuration = duration;
    room.timerEnd = Date.now() + duration;
    room.timer = setTimeout(() => {
      clearRoomTimer(room);
      addLog(room, `⏳ Temps écoulé. Blocage accepté.`);
      room.pendingAction = null;
      room.challengeCtx = null;
      nextTurn(room);
    }, duration);

    broadcast(room);
  });

  socket.on('block:contest', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'block_challenge') return;
    if (room.challengeCtx.originalAction.actorId !== playerId) return;

    clearRoomTimer(room);
    const blocker = playerById(room, room.challengeCtx.blockerId);
    const actor = playerById(room, playerId);
    const blockChar = room.challengeCtx.blockChar;
    const origAction = room.challengeCtx.originalAction;

    if (blocker.hand.includes(blockChar)) {
      addLog(room, `❌ ${actor.name} conteste à tort ! ${blocker.name} avait bien ${blockChar}.`);
      const idx = blocker.hand.indexOf(blockChar);
      blocker.hand.splice(idx, 1);
      room.deck.push(blockChar);
      shuffle(room.deck);
      blocker.hand.push(room.deck.pop());
      room.pendingAction = null; room.challengeCtx = null;
      loseCard(room, actor.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
    } else {
      addLog(room, `🚨 MENTEUR ! ${blocker.name} bluffait. L'action originale continue.`);
      room.pendingAction = origAction;
      room.challengeCtx = null;
      loseCard(room, blocker.id, undefined, () => resolveAction(room));
    }
  });

  socket.on('pick:card', ({ index }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'pick' || !room.pickCtx || room.pickCtx.playerId !== playerId) return;

    const cb = room.pickCtx.cb;
    room.pickCtx = null;
    room.phase = 'action';
    loseCard(room, playerId, index, cb);
  });

  socket.on('exchange:pick', ({ kept }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'exchange' || !room.exchangeCtx || room.exchangeCtx.playerId !== playerId) return;

    const actor = playerById(room, playerId);
    const { options, keepCount } = room.exchangeCtx;
    if (kept.length !== keepCount) return;

    actor.hand = kept.map(i => options[i]);
    const discarded = options.filter((_, i) => !kept.includes(i));
    discarded.forEach(c => room.deck.push(c));
    shuffle(room.deck);

    addLog(room, `🔄 ${actor.name} a mis à jour sa main.`);
    room.exchangeCtx = null;
    nextTurn(room);
  });

  // ── Espion : acquittement après avoir vu la carte ─────────────────────────
  socket.on('spy:ack', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'spy_reveal' || !room.spyCtx || room.spyCtx.spyId !== playerId) return;
    clearRoomTimer(room);
    room.spyCtx = null;
    nextTurn(room);
  });

  // ── Maître Chanteur : réponse de la cible ─────────────────────────────────
  socket.on('blackmail:pay', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'blackmail_response' || !room.blackmailCtx || room.blackmailCtx.targetId !== playerId) return;

    clearRoomTimer(room);
    const target = playerById(room, playerId);
    if (target.coins < 3) return socket.emit('error', 'Pas assez de pièces pour payer (3 requis).');

    target.coins -= 3;
    room.treasury += 3;
    addLog(room, `📜 ${target.name} paie 3 pièces (chantage accepté).`);
    room.blackmailCtx = null;
    room.pendingAction = null;
    nextTurn(room);
  });

  socket.on('blackmail:resist', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'blackmail_response' || !room.blackmailCtx || room.blackmailCtx.targetId !== playerId) return;

    clearRoomTimer(room);
    const target = playerById(room, playerId);
    addLog(room, `⚔️ ${target.name} résiste au chantage et perd une carte !`);
    const ctx = room.blackmailCtx;
    room.blackmailCtx = null;
    room.pendingAction = null;
    loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
  });

  // ── Croque Mort : réclamation de l'héritage ───────────────────────────────
  socket.on('croquemort:claim', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'croque_mort' || !room.croqueMortCtx) return;

    const claimer = playerById(room, playerId);
    const ctx = room.croqueMortCtx;

    // Vérifier si le réclamant a vraiment le Croque Mort
    if (claimer.hand.includes('Croque Mort')) {
      clearRoomTimer(room);
      claimer.coins += ctx.coins;
      addLog(room, `⚰️ ${claimer.name} (Croque Mort) récupère ${ctx.coins} pièce(s) de ${ctx.deceasedName}.`);
      const savedCb = ctx.cb;
      room.croqueMortCtx = null;
      if (savedCb) savedCb();
    } else {
      // Bluff — perd une carte
      addLog(room, `🚨 ${claimer.name} n'a pas le Croque Mort ! Il est démasqué.`);
      clearRoomTimer(room);
      room.treasury += ctx.coins; // pièces au trésor
      addLog(room, `⚰️ L'héritage de ${ctx.deceasedName} retourne au trésor.`);
      const savedCb = ctx.cb;
      room.croqueMortCtx = null;
      loseCard(room, playerId, undefined, () => { if (savedCb) savedCb(); });
    }
  });

  socket.on('croquemort:pass', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'croque_mort' || !room.croqueMortCtx) return;

    if (!room.passedPlayers.includes(playerId)) {
      room.passedPlayers.push(playerId);
      const alive = alivePlayers(room).length;
      if (room.passedPlayers.length >= alive) {
        clearRoomTimer(room);
        room.treasury += room.croqueMortCtx.coins;
        addLog(room, `⚰️ L'héritage retourne au trésor.`);
        const savedCb = room.croqueMortCtx.cb;
        room.croqueMortCtx = null;
        if (savedCb) savedCb();
      } else {
        broadcast(room);
      }
    }
  });

socket.on('room:rejoin', ({ roomCode: rc, playerId }) => {
    const room = rooms[rc];
    if (!room) return socket.emit('error', 'Salle introuvable ou expirée.');
    const p = playerById(room, playerId);
    if (!p) return socket.emit('error', 'Joueur introuvable dans cette salle.');
    p.socketId = socket.id;
    socket.join(rc);
    socket.data = { roomCode: rc, playerId };
    socket.emit('room:joined', { roomCode: rc, playerId });
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data || {};
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    const p = playerById(room, playerId);
    if (p) addLog(room, `🔌 ${p.name} est hors ligne.`);
    broadcast(room);
  });

  socket.on('room:leave', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room) return;

    // retirer joueur
    room.players = room.players.filter(p => p.id !== playerId);

    // si host quitte → nouveau host
    if (room.host === playerId && room.players.length > 0) {
      room.host = room.players[0].id;
    }

    // si plus personne → delete room
    if (room.players.length === 0) {
      delete rooms[roomCode];
      return;
    }

    // Si la partie a commencé, on élimine le joueur
    const p = playerById(room, playerId);
    if (p && room.started) {
      p.eliminated = true;
      addLog(room, `💀 ${p.name} a abandonné la partie.`);
      checkWin(room);
    } else if (p) {
      addLog(room, `🚪 ${p.name} a quitté la salle.`);
    }

    broadcast(room);
  });
}); // <-- Une seule accolade fermante pour io.on('connection')

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur Complots en écoute sur le port ${PORT}`));

