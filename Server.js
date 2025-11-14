
// =============== DIPENDENZE ===============
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// =============== CONFIGURAZIONE SERVER ===============
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servire file statici
app.use(express.static(path.join(__dirname)));

// =============== COSTANTI E VARIABILI GLOBALI ===============
let num_pokedex = 0;
let idCounter = 0;
// Stato del gioco
let players = {};


function broadcast(message) {
  const serializedMessage = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(serializedMessage);
      } catch (e) {
        console.error(`Errore nell'invio del messaggio: ${e.message}`);
      }
    }
  });
}
// =============== GESTIONE CONNESSIONI WEBSOCKET ===============
wss.on('connection', socket => {
  const id = ++idCounter;

  // Inizializzazione del nuovo giocatore
  players[id] = { 
    punteggio: 0,
    nickname: 'Player' + id, 
  };

  // Invia stato iniziale a questo client
  socket.send(JSON.stringify({ type: 'init', id, players }));

  socket.on('message', msgStr => {
    const msg = JSON.parse(msgStr);
    console.log(`[SERVER] Ricevuto messaggio:`, msg);

    // Non processare messaggi per giocatori non vivi
    if (!players[id]) return;
  
    // Gestione messaggi dal client
    if (msg.type === 'Join' && msg.nickname) {
      // Imposta il nickname e reinizializza il giocatore
      players[id].nickname = msg.nickname;
    }else if (msg.type === 'Guess' && msg.Risposta) {
      //Da Approfondire Confronto risposta con Array numero-pokemon
      //if indovina
      players[id].punteggio++;
      broadcast({ type: 'Correct', msg });
      //else non indovina
      broadcast({ type: 'Wrong', msg });
    }
  });
  
  // Gestione disconnessione
  socket.on('close', () => {
    delete players[id];
    broadcast({ type: 'remove', id });
  });
});

// =============== TIMER E INTERVALLI ===============
// Timer durata del round
setInterval(DurataRound, 30000);

// =============== AVVIO SERVER ===============
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Game server running on port ${PORT}`));
