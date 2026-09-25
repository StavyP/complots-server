'use strict';
// salles.js — Branchement Socket.IO commun à tous les jeux.
//
// Chaque jeu vit dans son propre espace de noms (`/skyjo`, `/complots`…) :
// ses salles, ses codes et ses événements ne se mélangent jamais avec ceux
// des autres jeux, même sur un seul serveur.
//
// Protocole identique pour tous les jeux (le kit client public/_commun/table.js
// le parle) :
//   client → serveur : room:create {name} · room:join {code,name}
//                      room:reconnect {code,playerId} · room:settings {…}
//                      game:start · game:replay · room:leave · room:chat {text}
//                      + les événements propres au jeu (module.events)
//   serveur → client : room:joined {roomCode,playerId} · room:gone
//                      game:state (vue personnelle) · game:rejected · error
const { makeCode, newPlayerId } = require('./outils');

const ROOM_IDLE_MS = 6 * 3600 * 1000;

// Registre des codes, TOUS jeux confondus : un code désigne une seule table
// sur tout le serveur. L'accueil du site peut ainsi rejoindre une table à
// partir du seul code, sans savoir de quel jeu il s'agit (voir trouverSalle).
const REGISTRE = new Map(); // code → id du jeu

function codeLibre() {
  let code;
  do code = makeCode(); while (REGISTRE.has(code));
  return code;
}

/** Jeu auquel appartient une table ouverte, ou null. */
function trouverSalle(code) {
  return REGISTRE.get(String(code || '').toUpperCase()) || null;
}

/**
 * Monte un jeu sur le serveur.
 * `jeu` : { id, createRoom(code, { onChange }), events: { 'evt': 'méthode' } }
 */
function monterJeu(io, jeu) {
  const nsp = io.of('/' + jeu.id);
  const rooms = {};

  const broadcast = (room) => {
    room.players.forEach((p) => {
      // Un joueur parti ne reçoit plus rien de cette table.
      if (p.socketId && p.connected !== false && !p.left) nsp.to(p.socketId).emit('game:state', room.viewFor(p.id));
    });
  };

  const ctx = (socket) => {
    const { roomCode, playerId } = socket.data || {};
    const room = rooms[roomCode];
    return room ? { room, playerId } : {};
  };

  // Ménage : salles inactives depuis longtemps.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of Object.entries(rooms)) {
      if (now - room.touchedAt > ROOM_IDLE_MS) {
        room.clearTimer?.();
        delete rooms[code];
        REGISTRE.delete(code);
      }
    }
  }, 30 * 60 * 1000);
  sweep.unref?.();

  nsp.on('connection', (socket) => {
    const fail = (msg) => socket.emit('error', msg);
    const guard = (fn) => (...args) => {
      try {
        fn(...args);
      } catch (e) {
        console.error(`[${jeu.id}]`, e);
        fail('Erreur du serveur.');
      }
    };

    socket.on('room:create', guard(({ name } = {}) => {
      const code = codeLibre();
      const room = jeu.createRoom(code, { onChange: broadcast });
      rooms[code] = room;
      REGISTRE.set(code, jeu.id);
      const id = newPlayerId();
      room.addPlayer(id, name, socket.id);
      socket.join(code);
      socket.data = { roomCode: code, playerId: id };
      socket.emit('room:joined', { roomCode: code, playerId: id });
      broadcast(room);
    }));

    socket.on('room:join', guard(({ code, name } = {}) => {
      const room = rooms[String(code || '').toUpperCase()];
      if (!room) return fail('Salle introuvable.');
      const id = newPlayerId();
      const err = room.addPlayer(id, name, socket.id);
      if (err) return fail(err);
      socket.join(room.code);
      socket.data = { roomCode: room.code, playerId: id };
      socket.emit('room:joined', { roomCode: room.code, playerId: id });
      broadcast(room);
    }));

    socket.on('room:reconnect', guard(({ code, playerId } = {}) => {
      const room = rooms[String(code || '').toUpperCase()];
      if (!room || !room.player(playerId)) return socket.emit('room:gone');
      const ok = room.reconnect ? room.reconnect(playerId, socket.id) : true;
      if (ok === false) return socket.emit('room:gone');
      socket.join(room.code);
      socket.data = { roomCode: room.code, playerId };
      socket.emit('room:joined', { roomCode: room.code, playerId });
      broadcast(room);
    }));

    socket.on('room:settings', guard((settings) => {
      const { room, playerId } = ctx(socket);
      if (!room) return;
      const err = room.setSettings(playerId, settings);
      if (err) fail(err);
    }));

    socket.on('game:start', guard(() => {
      const { room, playerId } = ctx(socket);
      if (!room) return;
      const err = room.start(playerId);
      if (err) fail(err);
    }));

    socket.on('game:replay', guard(() => {
      const { room, playerId } = ctx(socket);
      if (!room) return;
      const err = room.backToLobby(playerId);
      if (err) fail(err);
    }));

    socket.on('room:leave', guard(() => {
      const { room, playerId } = ctx(socket);
      if (!room) return;
      room.removePlayer(playerId);
      socket.leave(room.code);
      socket.data = {};
      if (!room.players.some((p) => !p.left)) {
        room.clearTimer?.();
        delete rooms[room.code];
        REGISTRE.delete(room.code);
      }
    }));

    socket.on('room:chat', guard((payload) => {
      const { room, playerId } = ctx(socket);
      if (!room || typeof room.chat !== 'function') return;
      if (room.chat(playerId, payload) === false) socket.emit('game:rejected');
    }));

    for (const [evt, method] of Object.entries(jeu.events || {})) {
      socket.on(evt, guard((payload) => {
        const { room, playerId } = ctx(socket);
        if (!room) return;
        const ok = room[method](playerId, payload);
        if (ok === false) socket.emit('game:rejected');
      }));
    }

    socket.on('disconnect', guard(() => {
      const { room, playerId } = ctx(socket);
      if (!room) return;
      if (room.disconnect) room.disconnect(playerId, socket.id);
      else {
        const p = room.player(playerId);
        if (p && p.socketId === socket.id) p.connected = false;
        room.settle?.();
        broadcast(room);
      }
    }));
  });

  return { id: jeu.id, count: () => Object.keys(rooms).length, rooms };
}

module.exports = { monterJeu, trouverSalle };
