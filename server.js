const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── State ────────────────────────────────────────────────────────────────────
const rooms = {};

// Dictionnaire complet des personnages (nom, action, contre, etc.)
const ALL_CHARACTERS = {
  // Complots 1
  'Duc': { icon: '♛', type: 'classic', short: 'Taxes · Bloque aide' },
  'Assassin': { icon: '☽', type: 'classic', short: 'Assassine pour 3 pièces' },
  'Comtesse': { icon: '❦', type: 'classic', short: 'Bloque l\'Assassin' },
  'Capitaine': { icon: '⚓', type: 'classic', short: 'Vole 2 pièces · Bloque Vol' },
  'Ambassadeur': { icon: '⚜', type: 'classic', short: 'Échange cartes · Bloque Vol' },
  'Inquisiteur': { icon: '⚖', type: 'classic', short: 'Regarde/Échange · Bloque Vol' },
  
  // Complots 2
  'Espion': { icon: '👁', type: 'complots2', short: 'Regarde carte · Vole 1 pièce' },
  'Pape': { icon: '👑', type: 'complots2', short: 'Prend 1 pièce à tous · Bloqué par Pape' },
  'Justicier': { icon: '⚖', type: 'complots2', short: 'Vole le + riche · Donne au + pauvre' },
  'Ursuline': { icon: '⛪', type: 'complots2', short: 'Prend 3 au trésor · Donne 1 à joueur' },
  'Illusionniste': { icon: '🎩', type: 'complots2', short: 'Prend 4 pièces · Bloque aide' },
  'Bourreau': { icon: '⛏', type: 'complots2', short: 'Assassine pour 3 pièces' },
  'Maître Chanteur': { icon: '📜', type: 'complots2', short: 'Force la cible à payer ou mourir' },
  'Croque Mort': { icon: '⚰️', type: 'complots2', short: 'Prend or du mort · Bloque assassin' },
  'Sorcière': { icon: '🔮', type: 'complots2', short: 'Prend 5 pièces si éliminée' },
  
  // Noms additionnels demandés dans les presets (ex: Duchesse)
  'Duchesse': { icon: '♛', type: 'complots2', short: 'Taxes · Bloque aide' },
};

function buildDeck(playerCount, roster) {
  // Le roster contient un tableau de 5 noms de cartes
  const times = playerCount >= 7 ? 4 : 3;
  const deck = [];
  
  roster.forEach(c => { 
    for (let i = 0; i < times; i++) deck.push(c); 
  });

  // Mélange (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
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
    const view = buildView(room, p.id);
    io.to(p.socketId).emit('game:state', view);
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
    pickCtx: room.pickCtx ? { type: room.pickCtx.type, playerId: room.pickCtx.playerId, options: room.pickCtx.playerId === playerId ? room.pickCtx.options : null } : null,
    exchangeCtx: room.exchangeCtx && room.exchangeCtx.playerId === playerId ? room.exchangeCtx : null,
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
    p.eliminated = true;
    addLog(room, `💀 ${p.name} est éliminé.`);
    if (cb) cb();
    return;
  }
  if (p.hand.length === 1 || cardIndex !== undefined) {
    const idx = cardIndex ?? 0;
    const card = p.hand.splice(idx, 1)[0];
    p.revealed.push(card);
    addLog(room, `👁 ${p.name} révèle et perd son : ${card}.`);
    if (p.hand.length === 0) p.eliminated = true;
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
      nextTurn(room); break;
    case 'foreign_aid':
      actor.coins += 2; room.treasury -= 2;
      addLog(room, `💰 ${actor.name} reçoit l'aide étrangère (2 pièces).`);
      nextTurn(room); break;
    case 'tax':
      actor.coins += 3; room.treasury -= 3;
      addLog(room, `💰 ${actor.name} collecte les taxes.`);
      nextTurn(room); break;
    case 'steal':
      const stolen = Math.min(2, target.coins);
      target.coins -= stolen; actor.coins += stolen;
      addLog(room, `⚖ ${actor.name} vole ${stolen} pièce(s) à ${target.name}.`);
      nextTurn(room); break;
    case 'assassinate':
      actor.coins -= 3; room.treasury += 3;
      addLog(room, `🗡 ${actor.name} assassine ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
      break;
    case 'exchange':
      const drawn = [room.deck.pop(), room.deck.pop()];
      room.exchangeCtx = { playerId: actor.id, options: [...actor.hand, ...drawn], keepCount: actor.hand.length };
      room.phase = 'exchange';
      addLog(room, `👁 ${actor.name} utilise une carte d'échange.`);
      broadcast(room); break;
    case 'coup':
      actor.coins -= 7; room.treasury += 7;
      addLog(room, `⚔ ${actor.name} lance un coup d'état contre ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
      break;
  }
}

// ── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('room:create', ({ name }) => {
    const code = makeCode();
    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    rooms[code] = {
      code, host: playerId, started: false, phase: 'lobby',
      settings: {
        turnDuration: 10,
        type: 'classic', // 'classic' ou 'complots2'
        preset: '1',     // Numéro de preset
        roster: ['Duc', 'Assassin', 'Comtesse', 'Capitaine', 'Ambassadeur']
      },
      timerDuration: 10000,
      players: [{ id: playerId, name, socketId: socket.id, hand: [], revealed: [], coins: 0, eliminated: false }],
      deck: [], treasury: 0, currentPlayerId: null, log: [],
      pendingAction: null, challengeCtx: null, passedPlayers: [], pickCtx: null, exchangeCtx: null, winnerId: null,
      timer: null, timerEnd: null
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
      room.settings.turnDuration = Math.max(5, Math.min(30, settings.turnDuration));
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
    if (actor.coins >= 10 && actionId !== 'coup') return socket.emit('error', 'Coup d\'état obligatoire (10+ pièces).');

    const uncontestable = ['income', 'coup'];

    room.pendingAction = { 
      id: actionId, 
      actorId: playerId, 
      targetId: targetId || null, 
      claimChar: null, 
      blockableBy: null 
    };

    if (uncontestable.includes(actionId)) {
      return resolveAction(room);
    }

    room.phase = 'challenge';
    room.passedPlayers = [playerId];
    addLog(room, `⚡ ${actor.name} déclare : ${actionId}${target ? ' sur ' + target.name : ''}`);

    const duration = room.settings.turnDuration * 1000;
    room.timerDuration = duration;
    room.timerEnd = Date.now() + duration;
    room.timer = setTimeout(() => {
      resolveAction(room);
    }, duration);

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
    
    // Contestation générique
    const claimChar = room.pendingAction.claimChar || '';
    if (actor.hand.includes(claimChar)) {
      addLog(room, `❌ ${challenger.name} se trompe ! ${actor.name} AVAIT bien : ${claimChar}.`);
      const idx = actor.hand.indexOf(claimChar);
      actor.hand.splice(idx, 1);
      room.deck.push(claimChar);
      for (let i = room.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]]; }
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
    room.pendingAction = { ...room.pendingAction, claimChar: blockChar, actorId: playerId };
    room.phase = 'block_challenge';
    
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
      addLog(room, `❌ ${actor.name} conteste à tort ! ${blocker.name} AVAIT ${blockChar}.`);
      const idx = blocker.hand.indexOf(blockChar);
      blocker.hand.splice(idx, 1);
      room.deck.push(blockChar);
      for (let i = room.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]]; }
      blocker.hand.push(room.deck.pop());
      room.pendingAction = null; room.challengeCtx = null;
      loseCard(room, actor.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
    } else {
      addLog(room, `🚨 MENTEUR ! ${blocker.name} bluffait. L'action continue.`);
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
    for (let i = room.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]]; }

    addLog(room, `🔄 ${actor.name} a mis à jour sa main.`);
    room.exchangeCtx = null;
    nextTurn(room);
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
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur Complots en écoute sur le port ${PORT}`));
