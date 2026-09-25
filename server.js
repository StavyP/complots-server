'use strict';
// server.js — Serveur unique des jeux de la Tanière (hébergé sur Render,
// dépôt GitHub StavyP/complots-server, adresse complots-server.onrender.com).
//
// Chaque jeu vit dans son propre espace Socket.IO : /complots, /skyjo,
// /incan, /wavelength, /traitres, /7wonders, /duel. Voir lib/salles.js pour le
// protocole commun et jeux/*.js pour les règles de chaque jeu.
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { monterJeu, trouverSalle } = require('./lib/salles');

const JEUX = require('./jeux');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const montes = JEUX.map((jeu) => monterJeu(io, jeu));

// Page de santé : Render la sonde, et elle sert à vérifier d'un coup d'œil
// quels jeux sont en ligne et combien de salles sont ouvertes.
app.get('/', (_req, res) => {
  // Lisible depuis l'accueil du site (autre domaine) : il réveille le serveur
  // dès l'arrivée et affiche le nombre de tables ouvertes par jeu.
  res.set('Access-Control-Allow-Origin', '*');
  res.json({
    ok: true,
    service: 'La Tanière — serveur de jeux',
    jeux: montes.map((m) => ({ id: m.id, salles: m.count() })),
  });
});

// Rejoindre depuis l'accueil avec le seul code : à quel jeu est cette table ?
app.get('/salle/:code', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const jeu = trouverSalle(req.params.code);
  if (!jeu) return res.status(404).json({ ok: false });
  res.json({ ok: true, jeu });
});

// Données statiques d'un jeu (cartes, merveilles…) pour l'affichage côté
// client : une seule source, celle du moteur. Mises en cache une heure.
app.get('/donnees/:jeu', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const jeu = JEUX.find((j) => j.id === req.params.jeu);
  if (!jeu || !jeu.donnees) return res.status(404).json({ ok: false });
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(jeu.donnees);
});

process.on('uncaughtException', (err) => console.error('uncaughtException:', err));
process.on('unhandledRejection', (reason) => console.error('unhandledRejection:', reason));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur de la Tanière sur le port ${PORT} — jeux : ${montes.map((m) => m.id).join(', ')}`);
});
