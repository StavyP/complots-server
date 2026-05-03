const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
 
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
 
const rooms = {};
 
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
 
// targetOnly = true → seule la cible peut bloquer
const BLOCKABLE_BY = {
  'foreign_aid': { chars: ['Duc', 'Duchesse', 'Illusionniste'], targetOnly: false },
  'steal':       { chars: ['Capitaine', 'Ambassadeur', 'Inquisiteur', 'Justicier'], targetOnly: true },
  'assassinate': { chars: ['Comtesse', 'Croque Mort'], targetOnly: true },
};
 
// Non contestable ET non bloquable → résolution immédiate
const INSTANT_ACTIONS = ['income', 'coup'];
 
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
      ? { playerId: room.pickCtx.playerId, options: room.pickCtx.playerId === playerId ? room.pickCtx.options : null }
      : null,
    exchangeCtx: room.exchangeCtx && room.exchangeCtx.playerId === playerId ? room.exchangeCtx : null,
    spyCtx: room.spyCtx && room.spyCtx.spyId === playerId ? room.spyCtx : (room.spyCtx ? { spyId: room.spyCtx.spyId } : null),
    blackmailCtx: room.blackmailCtx || null,
    croqueMortCtx: room.croqueMortCtx || null,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      eliminated: p.eliminated,
      cardCount: p.hand.length,
      hand: p.id === playerId ? p.hand : null,
      revealed: p.revealed,
      hasPassed: room.passedPlayers.includes(p.id),
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
 
function playerById(room, id) { return room.players.find(p => p.id === id); }
 
function autoPassEliminated(room) {
  room.players.forEach(p => {
    if (p.eliminated && !room.passedPlayers.includes(p.id)) room.passedPlayers.push(p.id);
  });
}
 
function loseCard(room, playerId, cardIndex, cb) {
  clearRoomTimer(room);
  const p = playerById(room, playerId);
  if (!p) { if (cb) cb(); return; }
 
  if (p.hand.length === 0) {
    if (!p.eliminated) { p.eliminated = true; addLog(room, `💀 ${p.name} est éliminé.`); }
    if (cb) cb();
    return;
  }
 
  if (p.hand.length === 1 || cardIndex !== undefined) {
    const idx = cardIndex ?? 0;
    const card = p.hand.splice(idx, 1)[0];
    p.revealed.push(card);
    addLog(room, `👁 ${p.name} révèle et perd : ${card}.`);
 
    if (card === 'Sorcière') {
      const bonus = Math.min(5, room.treasury);
      p.coins += bonus; room.treasury -= bonus;
      addLog(room, `🔮 Sorcière de ${p.name} : +${bonus} pièce(s) !`);
    }
 
    if (p.hand.length === 0) {
      p.eliminated = true;
      addLog(room, `💀 ${p.name} est éliminé.`);
    }
 
    // Fenêtre Croque Mort après élimination
    if (p.eliminated && p.coins > 0 && room.settings.roster.includes('Croque Mort')) {
      const inheritedCoins = p.coins;
      p.coins = 0;
      room.croqueMortCtx = { deceasedName: p.name, coins: inheritedCoins, claimerId: null, cb };
      room.passedPlayers = [];
      autoPassEliminated(room);
      room.phase = 'croque_mort';
      const duration = Math.min(room.settings.turnDuration * 1000, 20000);
      room.timerDuration = duration;
      room.timerEnd = Date.now() + duration;
      room.timer = setTimeout(() => {
        clearRoomTimer(room);
        if (!room.croqueMortCtx) return;
        room.treasury += room.croqueMortCtx.coins;
        addLog(room, `⚰️ L'héritage de ${p.name} retourne au trésor.`);
        const savedCb = room.croqueMortCtx.cb;
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
      nextTurn(room); break;
    case 'foreign_aid':
      actor.coins += 2; room.treasury -= 2;
      addLog(room, `💰 ${actor.name} reçoit l'aide étrangère (+2).`);
      nextTurn(room); break;
    case 'tax':
      actor.coins += 3; room.treasury -= 3;
      addLog(room, `💰 ${actor.name} collecte les taxes (+3).`);
      nextTurn(room); break;
    case 'steal': {
      const stolen = Math.min(2, target.coins);
      target.coins -= stolen; actor.coins += stolen;
      addLog(room, `⚓ ${actor.name} vole ${stolen} pièce(s) à ${target.name}.`);
      nextTurn(room); break;
    }
    case 'assassinate':
      actor.coins -= 3; room.treasury += 3;
      addLog(room, `☽ ${actor.name} assassine ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); }); break;
    case 'exchange': {
      const drawn = [room.deck.pop(), room.deck.pop()].filter(Boolean);
      room.exchangeCtx = { playerId: actor.id, options: [...actor.hand, ...drawn], keepCount: actor.hand.length };
      room.phase = 'exchange';
      addLog(room, `⚜ ${actor.name} échange ses cartes.`);
      broadcast(room); break;
    }
    case 'coup':
      actor.coins -= 7; room.treasury += 7;
      addLog(room, `⚔ ${actor.name} coup d'état contre ${target.name} !`);
      loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); }); break;
    case 'spy': {
      if (!target || target.hand.length === 0) { nextTurn(room); break; }
      const revealedCard = target.hand[Math.floor(Math.random() * target.hand.length)];
      const stolenSpy = Math.min(1, target.coins);
      target.coins -= stolenSpy; actor.coins += stolenSpy;
      addLog(room, `👁 ${actor.name} espionne ${target.name} et vole ${stolenSpy} pièce(s).`);
      room.spyCtx = { spyId: actor.id, card: revealedCard, targetName: target.name };
      room.phase = 'spy_reveal';
      const spyDur = room.settings.turnDuration * 1000;
      room.timerDuration = spyDur; room.timerEnd = Date.now() + spyDur;
      room.timer = setTimeout(() => { clearRoomTimer(room); room.spyCtx = null; nextTurn(room); }, spyDur);
      broadcast(room); break;
    }
    case 'tax_all': {
      let total = 0;
      alivePlayers(room).forEach(p => { if (p.id !== actor.id && p.coins > 0) { p.coins -= 1; total += 1; } });
      actor.coins += total;
      addLog(room, `👑 ${actor.name} (Pape) prélève 1 pièce/joueur (+${total}).`);
      nextTurn(room); break;
    }
    case 'tithe': {
      const av = Math.min(3, room.treasury);
      actor.coins += av; room.treasury -= av;
      if (target && av >= 1) { actor.coins -= 1; target.coins += 1; addLog(room, `⛪ ${actor.name} prend 3 et donne 1 à ${target.name}.`); }
      else addLog(room, `⛪ ${actor.name} prend ${av} pièce(s).`);
      nextTurn(room); break;
    }
    case 'extort4': {
      const av4 = Math.min(4, room.treasury);
      actor.coins += av4; room.treasury -= av4;
      addLog(room, `🎩 ${actor.name} (Illusionniste) prend ${av4} pièces.`);
      nextTurn(room); break;
    }
    case 'blackmail': {
      addLog(room, `📜 ${actor.name} fait chanter ${target.name} !`);
      room.blackmailCtx = { actorId: actor.id, targetId: target.id };
      room.phase = 'blackmail_response';
      const bmDur = room.settings.turnDuration * 1000;
      room.timerDuration = bmDur; room.timerEnd = Date.now() + bmDur;
      room.timer = setTimeout(() => {
        clearRoomTimer(room);
        const t = playerById(room, room.blackmailCtx?.targetId);
        addLog(room, `⏳ ${t?.name || '?'} n'a pas répondu — perd une carte !`);
        const bmCtx = room.blackmailCtx;
        room.blackmailCtx = null; room.pendingAction = null;
        if (t) loseCard(room, t.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
        else nextTurn(room);
      }, bmDur);
      broadcast(room); break;
    }
    default: nextTurn(room);
  }
}
 
// ── SOCKET ────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
 
  socket.on('room:create', ({ name }) => {
    const code = makeCode();
    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    rooms[code] = {
      code, host: playerId, started: false, phase: 'lobby',
      settings: { turnDuration: 30, type: 'classic', preset: '1', roster: ['Duchesse','Assassin','Capitaine','Ambassadeur','Comtesse'] },
      timerDuration: 30000,
      players: [{ id: playerId, name, socketId: socket.id, hand: [], revealed: [], coins: 0, eliminated: false }],
      deck: [], treasury: 0, currentPlayerId: null, log: [],
      pendingAction: null, challengeCtx: null, passedPlayers: [],
      pickCtx: null, exchangeCtx: null, spyCtx: null, blackmailCtx: null, croqueMortCtx: null,
      winnerId: null, timer: null, timerEnd: null,
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
    if (room.players.length >= 6) return socket.emit('error', 'Salle pleine (6 max).');
    const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
    room.players.push({ id: playerId, name, socketId: socket.id, hand: [], revealed: [], coins: 0, eliminated: false });
    socket.join(code);
    socket.data = { roomCode: code, playerId };
    socket.emit('room:joined', { roomCode: code, playerId });
    broadcast(room);
  });
 
  socket.on('room:leave', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room) return;
    const p = playerById(room, playerId);
    if (!p) return;
    if (room.started) {
      // En jeu : élimination
      p.eliminated = true;
      p.hand = [];
      addLog(room, `🏳️ ${p.name} a abandonné la partie.`);
      socket.leave(roomCode);
      socket.data = {};
      if (!checkWin(room)) {
        if (room.currentPlayerId === playerId) nextTurn(room);
        else broadcast(room);
      }
    } else {
      // En lobby : retrait
      const name = p.name;
      room.players = room.players.filter(pl => pl.id !== playerId);
      if (room.host === playerId && room.players.length > 0) room.host = room.players[0].id;
      if (room.players.length === 0) { delete rooms[roomCode]; return; }
      addLog(room, `🚪 ${name} a quitté la salle.`);
      socket.leave(roomCode);
      socket.data = {};
      broadcast(room);
    }
  });
 
  socket.on('room:settings', (settings) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.host !== playerId || room.started) return;
    room.settings.turnDuration = Math.max(5, Math.min(60, settings.turnDuration));
    room.settings.type = settings.type;
    room.settings.preset = settings.preset;
    room.settings.roster = settings.roster;
    broadcast(room);
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
    // ── Ordre aléatoire ──
    const startIdx = Math.floor(Math.random() * room.players.length);
    room.currentPlayerId = room.players[startIdx].id;
    room.started = true;
    room.phase = 'action';
    room.winnerId = null;
    room.log = ['🎲 La partie commence !'];
    broadcast(room);
  });
 
  // ── Rejouer avec mêmes joueurs & settings ──
  socket.on('game:replay', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.host !== playerId) return;
    clearRoomTimer(room);
    room.deck = buildDeck(room.players.length, room.settings.roster);
    room.treasury = 50;
    room.players.forEach(p => {
      p.hand = [room.deck.pop(), room.deck.pop()];
      p.coins = 2; p.eliminated = false; p.revealed = [];
      room.treasury -= 2;
    });
    const startIdx = Math.floor(Math.random() * room.players.length);
    room.currentPlayerId = room.players[startIdx].id;
    room.started = true;
    room.phase = 'action';
    room.winnerId = null;
    room.pendingAction = null; room.challengeCtx = null; room.passedPlayers = [];
    room.pickCtx = null; room.exchangeCtx = null; room.spyCtx = null;
    room.blackmailCtx = null; room.croqueMortCtx = null;
    room.log = ['🎲 Revanche ! La partie repart !'];
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
 
    const blockInfo = BLOCKABLE_BY[actionId];
    const blockableChars = blockInfo ? blockInfo.chars.filter(c => room.settings.roster.includes(c)) : [];
    const blockTargetOnly = blockInfo ? blockInfo.targetOnly : false;
    const contestable = !['income', 'coup', 'foreign_aid'].includes(actionId);
 
    room.pendingAction = { id: actionId, actorId: playerId, targetId: targetId || null, blockableBy: blockableChars, blockTargetOnly, contestable };
 
    // Résolution immédiate si aucune interaction possible
    const noBlockers = blockableChars.length === 0;
    if (INSTANT_ACTIONS.includes(actionId) || (!contestable && noBlockers)) {
      return resolveAction(room);
    }
 
    room.phase = 'challenge';
    room.passedPlayers = [playerId];
    autoPassEliminated(room);
 
    const actionNames = { tax:'Taxes', steal:'Vol', assassinate:'Assassinat', exchange:'Échange', foreign_aid:'Aide étrangère', spy:'Espion', tax_all:'Prélèvement (Pape)', tithe:'Aumône (Ursuline)', extort4:'Extorsion (Illusionniste)', blackmail:'Chantage' };
    addLog(room, `⚡ ${actor.name} : ${actionNames[actionId] || actionId}${target ? ' → ' + target.name : ''}`);
 
    // Si tous déjà passés (seul joueur actif ?)
    if (room.passedPlayers.length >= alivePlayers(room).length) {
      return resolveAction(room);
    }
 
    const duration = room.settings.turnDuration * 1000;
    room.timerDuration = duration; room.timerEnd = Date.now() + duration;
    room.timer = setTimeout(() => resolveAction(room), duration);
    broadcast(room);
  });
 
  socket.on('challenge:pass', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || (room.phase !== 'challenge' && room.phase !== 'block_challenge')) return;
    if (room.passedPlayers.includes(playerId)) return;
    room.passedPlayers.push(playerId);
    const alive = alivePlayers(room).length;
    if (room.passedPlayers.length >= alive) {
      if (room.phase === 'challenge') resolveAction(room);
      else {
        clearRoomTimer(room);
        addLog(room, `🛡 Blocage accepté. Action annulée.`);
        room.pendingAction = null; room.challengeCtx = null; nextTurn(room);
      }
    } else broadcast(room);
  });
 
  socket.on('challenge:contest', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'challenge') return;
    const challenger = playerById(room, playerId);
    if (!challenger || challenger.eliminated) return;
    clearRoomTimer(room);
    const actor = playerById(room, room.pendingAction.actorId);
    const validChars = ACTION_VALID_CHARS[room.pendingAction.id] || [];
    const validChar = validChars.find(c => actor.hand.includes(c));
    if (validChar) {
      addLog(room, `❌ ${challenger.name} se trompe ! ${actor.name} avait : ${validChar}.`);
      const idx = actor.hand.indexOf(validChar);
      actor.hand.splice(idx, 1); room.deck.push(validChar); shuffle(room.deck); actor.hand.push(room.deck.pop());
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
    const blocker = playerById(room, playerId);
    if (!blocker || blocker.eliminated) return;
    const pa = room.pendingAction;
    // Vérifier restriction : si targetOnly, seule la cible peut bloquer
    if (pa.blockTargetOnly && pa.targetId !== playerId) return;
    clearRoomTimer(room);
    const actor = playerById(room, pa.actorId);
    addLog(room, `🛡 ${blocker.name} bloque avec ${blockChar} !`);
    room.challengeCtx = { blockerId: playerId, blockChar, originalAction: pa };
    room.pendingAction = { ...pa, actorId: playerId };
    room.phase = 'block_challenge';
    room.passedPlayers = alivePlayers(room).filter(p => p.id !== actor.id).map(p => p.id);
    const duration = room.settings.turnDuration * 1000;
    room.timerDuration = duration; room.timerEnd = Date.now() + duration;
    room.timer = setTimeout(() => {
      clearRoomTimer(room);
      addLog(room, `⏳ Blocage accepté (temps écoulé).`);
      room.pendingAction = null; room.challengeCtx = null; nextTurn(room);
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
      addLog(room, `❌ ${actor.name} conteste à tort ! ${blocker.name} avait ${blockChar}.`);
      const idx = blocker.hand.indexOf(blockChar);
      blocker.hand.splice(idx, 1); room.deck.push(blockChar); shuffle(room.deck); blocker.hand.push(room.deck.pop());
      room.pendingAction = null; room.challengeCtx = null;
      loseCard(room, actor.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
    } else {
      addLog(room, `🚨 ${blocker.name} bluffait ! L'action continue.`);
      room.pendingAction = origAction; room.challengeCtx = null;
      loseCard(room, blocker.id, undefined, () => resolveAction(room));
    }
  });
 
  socket.on('pick:card', ({ index }) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'pick' || !room.pickCtx || room.pickCtx.playerId !== playerId) return;
    const cb = room.pickCtx.cb;
    room.pickCtx = null; room.phase = 'action';
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
    options.filter((_, i) => !kept.includes(i)).forEach(c => room.deck.push(c));
    shuffle(room.deck);
    addLog(room, `🔄 ${actor.name} a échangé ses cartes.`);
    room.exchangeCtx = null; nextTurn(room);
  });
 
  socket.on('spy:ack', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'spy_reveal' || !room.spyCtx || room.spyCtx.spyId !== playerId) return;
    clearRoomTimer(room); room.spyCtx = null; nextTurn(room);
  });
 
  socket.on('blackmail:pay', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'blackmail_response' || !room.blackmailCtx || room.blackmailCtx.targetId !== playerId) return;
    clearRoomTimer(room);
    const target = playerById(room, playerId);
    if (target.coins < 3) return socket.emit('error', 'Pas assez de pièces (3 requis).');
    target.coins -= 3; room.treasury += 3;
    addLog(room, `📜 ${target.name} paie 3 pièces.`);
    room.blackmailCtx = null; room.pendingAction = null; nextTurn(room);
  });
 
  socket.on('blackmail:resist', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'blackmail_response' || !room.blackmailCtx || room.blackmailCtx.targetId !== playerId) return;
    clearRoomTimer(room);
    const target = playerById(room, playerId);
    addLog(room, `⚔️ ${target.name} résiste et perd une carte !`);
    room.blackmailCtx = null; room.pendingAction = null;
    loseCard(room, target.id, undefined, () => { if (!checkWin(room)) nextTurn(room); });
  });
 
  // ── Croque Mort : PHASE 1 — réclamer l'héritage (peut être bluffé) ─────────
  socket.on('croquemort:claim', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'croque_mort' || !room.croqueMortCtx) return;
    const ctx = room.croqueMortCtx;
    if (ctx.claimerId) return; // déjà réclamé
    const claimer = playerById(room, playerId);
    if (!claimer || claimer.eliminated) return;
 
    ctx.claimerId = playerId;
    addLog(room, `⚰️ ${claimer.name} réclame l'héritage de ${ctx.deceasedName} !`);
 
    // On passe en phase de contestation
    clearRoomTimer(room);
    room.phase = 'croque_mort_contest';
    room.passedPlayers = [playerId]; // le réclamant passe d'office
    autoPassEliminated(room);
 
    // Si tous les autres ont déjà passé → acceptation immédiate
    if (room.passedPlayers.length >= alivePlayers(room).length) {
      claimer.coins += ctx.coins;
      addLog(room, `⚰️ ${claimer.name} récupère ${ctx.coins} pièce(s) sans contestation.`);
      const savedCb = ctx.cb; room.croqueMortCtx = null;
      if (savedCb) savedCb();
      return;
    }
 
    const duration = Math.min(room.settings.turnDuration * 1000, 20000);
    room.timerDuration = duration; room.timerEnd = Date.now() + duration;
    room.timer = setTimeout(() => {
      clearRoomTimer(room);
      if (!room.croqueMortCtx) return;
      const cl = playerById(room, room.croqueMortCtx.claimerId);
      if (cl) { cl.coins += room.croqueMortCtx.coins; addLog(room, `⚰️ ${cl.name} récupère ${room.croqueMortCtx.coins} pièce(s).`); }
      else { room.treasury += room.croqueMortCtx.coins; }
      const savedCb = room.croqueMortCtx.cb; room.croqueMortCtx = null;
      if (savedCb) savedCb();
    }, duration);
    broadcast(room);
  });
 
  // ── Croque Mort : PHASE 2 — contester la réclamation ──────────────────────
  socket.on('croquemort:contest', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || room.phase !== 'croque_mort_contest' || !room.croqueMortCtx) return;
    const ctx = room.croqueMortCtx;
    const challenger = playerById(room, playerId);
    if (!challenger || challenger.eliminated || playerId === ctx.claimerId) return;
    clearRoomTimer(room);
    const claimer = playerById(room, ctx.claimerId);
    if (claimer.hand.includes('Croque Mort')) {
      addLog(room, `❌ ${challenger.name} se trompe ! ${claimer.name} avait bien le Croque Mort.`);
      claimer.coins += ctx.coins;
      addLog(room, `⚰️ ${claimer.name} récupère ${ctx.coins} pièce(s).`);
      const savedCb = ctx.cb; room.croqueMortCtx = null;
      loseCard(room, challenger.id, undefined, () => { if (!checkWin(room)) savedCb?.(); });
    } else {
      addLog(room, `🚨 ${claimer.name} bluffait le Croque Mort !`);
      room.treasury += ctx.coins;
      addLog(room, `⚰️ L'héritage retourne au trésor.`);
      const savedCb = ctx.cb; room.croqueMortCtx = null;
      loseCard(room, claimer.id, undefined, () => { if (!checkWin(room)) savedCb?.(); });
    }
  });
 
  // ── Croque Mort : passer (phase 1 ou 2) ───────────────────────────────────
  socket.on('croquemort:pass', () => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    if (!room || !room.croqueMortCtx) return;
    if (room.phase !== 'croque_mort' && room.phase !== 'croque_mort_contest') return;
    if (room.passedPlayers.includes(playerId)) return;
    room.passedPlayers.push(playerId);
    const alive = alivePlayers(room).length;
    if (room.passedPlayers.length >= alive) {
      clearRoomTimer(room);
      const ctx = room.croqueMortCtx;
      if (room.phase === 'croque_mort') {
        // Personne n'a réclamé → trésor
        room.treasury += ctx.coins;
        addLog(room, `⚰️ L'héritage retourne au trésor.`);
      } else {
        // Tous ont passé la contestation → réclamant reçoit l'or
        const claimer = playerById(room, ctx.claimerId);
        if (claimer) { claimer.coins += ctx.coins; addLog(room, `⚰️ ${claimer.name} récupère ${ctx.coins} pièce(s).`); }
        else { room.treasury += ctx.coins; }
      }
      const savedCb = ctx.cb; room.croqueMortCtx = null;
      if (savedCb) savedCb();
    } else broadcast(room);
  });
 
  socket.on('room:rejoin', ({ roomCode: rc, playerId }) => {
    const room = rooms[rc];
    if (!room) return socket.emit('error', 'Salle introuvable ou expirée.');
    const p = playerById(room, playerId);
    if (!p) return socket.emit('error', 'Joueur introuvable.');
    p.socketId = socket.id;
    socket.join(rc);
    socket.data = { roomCode: rc, playerId };
    socket.emit('room:joined', { roomCode: rc, playerId });
    broadcast(room);
  });
 
  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data || {};
    if (!roomCode || !rooms[roomCode]) return;
    const p = playerById(rooms[roomCode], playerId);
    if (p) addLog(rooms[roomCode], `🔌 ${p.name} est hors ligne.`);
    broadcast(rooms[roomCode]);
  });
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur Complots sur le port ${PORT}`));
