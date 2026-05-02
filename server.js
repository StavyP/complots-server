const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── State ────────────────────────────────────────────────────────────────────
const rooms = {}; // roomCode -> Room

const CHARS = ['Duc', 'Assassin', 'Comtesse', 'Capitaine', 'Ambassadeur'];

function buildDeck(playerCount) {
  const times = playerCount >= 7 ? 4 : 3;
  const deck = [];
  CHARS.forEach(c => { for (let i = 0; i < times; i++) deck.push(c); });
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
  // Send each player their own private view
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
    currentPlayerId: room.currentPlayerId,
    treasury: room.treasury,
    log: room.log,
    pendingAction: room.pendingAction,
    challengeCtx: room.challengeCtx,
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
    })),
    winnerId: room.winnerId,
    started: room.started,
  };
}

function addLog(room, msg) {
  room.log.unshift(msg);
  if (room.log.length > 40) room.log.pop();
}

function nextTurn(room) {
  room.phase = 'action';
  room.pendingAction = null;
  room.challengeCtx = null;
  room.pickCtx = null;
  room.exchangeCtx = null;
  room.challengerQueue = [];

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
  const p = playerById(room, playerId);
  if (p.hand.length === 0) {
    p.eliminated = true;
    addLog(room, `${p.name} est éliminé.`);
    if (cb) cb();
    return;
  }
  if (p.hand.length === 1 || cardIndex !== undefined) {
    const idx = cardIndex ?? 0;
    const card = p.hand.splice(idx, 1)[0];
    p.revealed.push(card);
    addLog(room, `${p.name} retourne : ${card}.`);
    if (p.hand.length === 0) p.eliminated = true;
    if (cb) cb();
    return;
  }
  // Need to ask the player to pick
  room.phase = 'pick';
  room.pickCtx = { playerId, cb, options: p.hand.map((c, i) => ({ card: c, index: i })) };
  broadcast(room);
}

function resolveAction(room) {
  const pa = room.pendingAction;
  const actor = playerById(room, pa.actorId);
  const target = pa.targetId ? playerById(room, pa.targetId) : null;

  switch (pa.id) {
    case 'income':
      actor.coins += 1; room.treasury -= 1;
      addLog(room, `${actor.name} prend 1 pièce (revenu).`);
      nextTurn(room); break;

    case 'foreign_aid':
      actor.coins += 2; room.treasury -= 2;
      addLog(room, `${actor.name} reçoit l'aide étrangère (2 pièces).`);
      nextTurn(room); break;

    case 'tax':
      actor.coins += 3; room.treasury -= 3;
      addLog(room, `${actor.name} collecte les taxes (3 pièces) en tant que Duc.`);
      nextTurn(room); break;

    case 'steal':
      const stolen = Math.min(2, target.coins);
      target.coins -= stolen; actor.coins += stolen;
      addLog(room, `${actor.name} vole ${stolen} pièce(s) à ${target.name}.`);
      nextTurn(room); break;

    case 'assassinate':
      actor.coins -= 3; room.treasury += 3;
      addLog(room, `${actor.name} assassine ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
      break;

    case 'exchange':
      const drawn = [room.deck.pop(), room.deck.pop()];
      room.exchangeCtx = { playerId: actor.id, options: [...actor.hand, ...drawn], keepCount: actor.hand.length };
      room.phase = 'exchange';
      addLog(room, `${actor.name} échange ses cartes (Ambassadeur).`);
      broadcast(room); break;

    case 'coup':
      actor.coins -= 7; room.treasury += 7;
      addLog(room, `${actor.name} commande un coup d'état contre ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
      break;
  }
}

function processChallenge(room) {
  if (room.challengerQueue.length === 0) {
    resolveAction(room);
    return;
  }
  room.phase = 'challenge';
  broadcast(room);
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
      players: [{ id: playerId, name, socketId: socket.id, hand: [], revealed: [], coins: 0, eliminated: false }],
      deck: [],
      treasury: 0,
      currentPlayerId: null,
      log: [],
      pendingAction: null,
      challengeCtx: null,
      challengerQueue: [],
      pickCtx: null,
      exchangeCtx: null,
      winnerId: null,
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
    if (room.players.length >= 6) return socket.emit('error', 'La salle est pleine (6 joueurs max).');

    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    room.players.push({ id: playerId, name, socketId: socket.id, hand: [], revealed: [], coins: 0, eliminated: false });
    socket.join(code);
    socket.data = { roomCode: code, playerId };
    socket.emit('room:joined', { roomCode: code, playerId });
    broadcast(room);
  });

  socket.on('game:start', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.host !== playerId) return;
    if (room.players.length < 3) return socket.emit('error', 'Il faut au moins 3 joueurs.');

    room.deck = buildDeck(room.players.length);
    room.treasury = 50;
    room.players.forEach(p => {
      p.hand = [room.deck.pop(), room.deck.pop()];
      p.coins = 2;
      p.eliminated = false;
      p.revealed = [];
      room.treasury -= 2;
    });
    room.currentPlayerId = room.players[0].id;
    room.started = true;
    room.phase = 'action';
    room.log = ['La partie commence !'];
    broadcast(room);
  });

  socket.on('action:do', ({ actionId, targetId }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'action' || room.currentPlayerId !== playerId) return;

    const actor = playerById(room, playerId);
    const target = targetId ? playerById(room, targetId) : null;

    // Validation
    if (actionId === 'coup' && actor.coins < 7) return;
    if (actionId === 'assassinate' && actor.coins < 3) return;
    if (actor.coins >= 10 && actionId !== 'coup') return socket.emit('error', 'Vous devez commanditer un coup (10 pièces).');

    const uncontestable = ['income', 'coup'];
    const claimChars = { tax: 'Duc', steal: 'Capitaine', assassinate: 'Assassin', exchange: 'Ambassadeur' };
    const blockableBy = { foreign_aid: 'Duc', steal: 'Capitaine/Ambassadeur', assassinate: 'Comtesse' };

    room.pendingAction = { id: actionId, actorId: playerId, targetId: targetId || null, claimChar: claimChars[actionId] || null, blockableBy: blockableBy[actionId] || null };

    if (uncontestable.includes(actionId)) {
      addLog(room, `${actor.name} → ${actionId === 'income' ? 'revenu' : `coup d'état contre ${target.name}`}`);
      return resolveAction(room);
    }

    // Build challenger queue: all alive players except actor
    room.challengerQueue = alivePlayers(room).filter(p => p.id !== playerId).map(p => p.id);
    room.phase = 'challenge';
    addLog(room, `${actor.name} déclare : ${actionId}${target ? ' → ' + target.name : ''}`);
    broadcast(room);
  });

  socket.on('challenge:pass', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'challenge') return;
    if (room.challengerQueue[0] !== playerId) return;

    room.challengerQueue.shift();
    processChallenge(room);
  });

  socket.on('challenge:contest', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'challenge') return;
    if (room.challengerQueue[0] !== playerId) return;

    const challenger = playerById(room, playerId);
    const actor = playerById(room, room.pendingAction.actorId);
    const claimChar = room.pendingAction.claimChar;

    if (!claimChar) return;

    if (actor.hand.includes(claimChar)) {
      // Actor wins — challenger loses a card, actor reshuffles
      addLog(room, `${challenger.name} conteste ${actor.name}... qui AVAIT bien le ${claimChar} ! ${challenger.name} perd une carte.`);
      const idx = actor.hand.indexOf(claimChar);
      actor.hand.splice(idx, 1);
      room.deck.push(claimChar);
      // Reshuffle
      for (let i = room.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]]; }
      actor.hand.push(room.deck.pop());
      room.challengerQueue = [];
      loseCard(room, challenger.id, undefined, () => resolveAction(room));
    } else {
      // Actor bluffed — actor loses a card, action fails
      addLog(room, `${challenger.name} conteste ${actor.name}... qui BLUFFAIT ! Action annulée. ${actor.name} perd une carte.`);
      room.challengerQueue = [];
      loseCard(room, actor.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
    }
  });

  socket.on('challenge:block', ({ blockChar }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'challenge') return;
    if (room.challengerQueue[0] !== playerId) return;

    const blocker = playerById(room, playerId);
    const actor = playerById(room, room.pendingAction.actorId);

    addLog(room, `${blocker.name} tente de bloquer avec le ${blockChar} !`);

    // Now actor must respond: accept block or contest the blocker's claim
    room.challengeCtx = { blockerId: playerId, blockChar, originalAction: room.pendingAction };
    room.pendingAction = { ...room.pendingAction, claimChar: blockChar, actorId: playerId };
    room.challengerQueue = [actor.id]; // only the original actor can contest the block
    room.phase = 'block_challenge';
    broadcast(room);
  });

  socket.on('block:accept', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'block_challenge') return;
    if (room.challengeCtx.originalAction.actorId !== playerId) return;

    const blocker = playerById(room, room.challengeCtx.blockerId);
    addLog(room, `Blocage de ${blocker.name} accepté. Action annulée.`);

    // Refund assassinate cost if applicable
    if (room.challengeCtx.originalAction.id === 'assassinate') {
      const actor = playerById(room, room.challengeCtx.originalAction.actorId);
      // coins not yet deducted in this flow — no refund needed
    }
    room.pendingAction = null;
    room.challengeCtx = null;
    nextTurn(room);
  });

  socket.on('block:contest', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'block_challenge') return;
    if (room.challengeCtx.originalAction.actorId !== playerId) return;

    const blocker = playerById(room, room.challengeCtx.blockerId);
    const actor = playerById(room, playerId);
    const blockChar = room.challengeCtx.blockChar;
    const origAction = room.challengeCtx.originalAction;

    if (blocker.hand.includes(blockChar)) {
      // Blocker wins — actor loses a card
      addLog(room, `${actor.name} conteste le blocage de ${blocker.name}... qui AVAIT bien le ${blockChar} ! ${actor.name} perd une carte.`);
      const idx = blocker.hand.indexOf(blockChar);
      blocker.hand.splice(idx, 1);
      room.deck.push(blockChar);
      for (let i = room.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]]; }
      blocker.hand.push(room.deck.pop());
      room.pendingAction = null; room.challengeCtx = null;
      loseCard(room, actor.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
    } else {
      // Blocker bluffed — blocker loses a card, original action resolves
      addLog(room, `${actor.name} conteste le blocage de ${blocker.name}... qui BLUFFAIT ! L'action continue.`);
      room.pendingAction = origAction;
      room.challengeCtx = null;
      loseCard(room, blocker.id, undefined, () => resolveAction(room));
    }
  });

  socket.on('pick:card', ({ index }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'pick') return;
    if (!room.pickCtx || room.pickCtx.playerId !== playerId) return;

    const cb = room.pickCtx.cb;
    room.pickCtx = null;
    room.phase = 'action';
    loseCard(room, playerId, index, cb);
  });

  socket.on('exchange:pick', ({ kept }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'exchange') return;
    if (!room.exchangeCtx || room.exchangeCtx.playerId !== playerId) return;

    const actor = playerById(room, playerId);
    const { options, keepCount } = room.exchangeCtx;
    if (kept.length !== keepCount) return;

    actor.hand = kept.map(i => options[i]);
    const discarded = options.filter((_, i) => !kept.includes(i));
    discarded.forEach(c => room.deck.push(c));
    for (let i = room.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [room.deck[i], room.deck[j]] = [room.deck[j], room.deck[i]]; }

    addLog(room, `${actor.name} a échangé ses cartes.`);
    room.exchangeCtx = null;
    nextTurn(room);
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data || {};
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    const p = playerById(room, playerId);
    if (p) addLog(room, `${p.name} s'est déconnecté.`);
    // Keep room alive; player can reconnect
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Complots server listening on port ${PORT}`));
