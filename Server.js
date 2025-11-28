// Server.js
// Dipendenze
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pokedex = require('./Pokedex.json');
const Levenshtein = require('fast-levenshtein');

// Configurazione
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servire file statici (index.html, game.html, client.js, ecc.)
app.use(express.static(path.join(__dirname)));

// Globali
let idCounter = 0;
let players = {};   // players[id] = { nickname, room, punteggio }
let rooms = {};     // rooms[roomId] = { players: {id: {...}}, p_num, turnoCountdown, countdownInterval, interRoundTime, interRoundInterval }

const MAX_PLAYERS_PER_ROOM = 2;

// Utility: invia messaggio a tutti i client in una stanza
function broadcastToRoom(room, message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.room === room) {
      client.send(data);
    }
  });
}

// Scegli un Pokémon random
function getPokemonRandom() {
  const lista = pokedex.pokemons;
  const index = Math.floor(Math.random() * lista.length);
  console.log(`🎲 Pokémon random scelto: ${lista[index].name} (#${lista[index].numero})`);
  return lista[index];
}

// Avvia / invia numero Pokémon e countdown per la stanza
function Invianumero(room) {
  const r = rooms[room];
  if (!r) {
    console.log(`❌ Invianumero: stanza non trovata: ${room}`);
    return;
  }

  // Scegli Pokémon e salvalo nella stanza
  const p = getPokemonRandom();
  r.p_num = p;

  console.log(`➡️ [${room}] Inviando numero Pokémon: #${p.numero}`);
  broadcastToRoom(room, { type: 'invio_numero', pokemon: { numero: p.numero } });

  // Cancella eventuale countdown precedente
  if (r.countdownInterval) clearInterval(r.countdownInterval);
  r.turnoCountdown = 30;

  // Avvia intervallo specifico della stanza
  r.countdownInterval = setInterval(() => {
    if (!rooms[room]) return; // stanza rimossa nel frattempo
    broadcastToRoom(room, { type: 'countdown', remaining: r.turnoCountdown });
    console.log(`[TIMER][${room}] Tempo rimanente turno: ${r.turnoCountdown}s`);
    r.turnoCountdown--;

    if (r.turnoCountdown < 0) {
      clearInterval(r.countdownInterval);
      r.countdownInterval = null;
      console.log(`[TIMER][${room}] Tempo scaduto! Mostro il nome del Pokémon`);
      InviaNome(room);
      TerminaRound(room);
    }
  }, 1000);
}

// Invia il nome del Pokémon corrente nella stanza
function InviaNome(room) {
  const r = rooms[room];
  if (!r || !r.p_num) {
    console.log(`⚠️ [${room}] Tentato invio nome, ma p_num non è impostato!`);
    return;
  }
  console.log(`➡️ [${room}] Inviando nome Pokémon: ${r.p_num.name}`);
  broadcastToRoom(room, {
    type: 'invio_nome',
    pokemon: { nome: r.p_num.name, numero: r.p_num.numero }
  });
}

// Termina round e avvia inter-round per la stanza
function TerminaRound(room) {
  const r = rooms[room];
  if (!r) return;

  if (r.interRoundInterval) clearInterval(r.interRoundInterval);
  r.interRoundTime = 5;
  console.log(`🔄 [${room}] Intervallo tra i round: ${r.interRoundTime}s`);

  r.interRoundInterval = setInterval(() => {
    if (!rooms[room]) return;
    broadcastToRoom(room, { type: 'countdown', remaining: r.interRoundTime });
    console.log(`[INTER-ROUND][${room}] Tempo rimanente: ${r.interRoundTime}s`);
    r.interRoundTime--;

    if (r.interRoundTime < 0) {
      clearInterval(r.interRoundInterval);
      r.interRoundInterval = null;
      console.log(`➡️ [${room}] Inizio nuovo round`);
      Invianumero(room);
    }
  }, 1000);
}

// Gestione connessioni
wss.on('connection', socket => {
  const id = ++idCounter;
  players[id] = { punteggio: 0, nickname: `Player${id}`, room: null, socket };
  console.log(`🟢 Nuova connessione → Player${id}`);

  // Invia init temporaneo (id): il client poi invierà Join con nickname e room
  socket.send(JSON.stringify({ type: 'init', id, players: {} }));

  socket.on('message', msgStr => {
    let msg;
    try { msg = JSON.parse(msgStr); }
    catch (e) { console.log('JSON parse error', e); return; }
    console.log(`📥 Ricevuto da Player${id}:`, msg);

    if (!players[id]) return; // nel caso di disconnessione

    // JOIN: nickname + room
    if (msg.type === 'Join') {
      const room = String(msg.room || 'default').toUpperCase();
      const nickname = msg.nickname ? String(msg.nickname).slice(0,20) : `Player${id}`;

      players[id].nickname = nickname;
      players[id].room = room;

      // crea stanza se non esiste
      if (!rooms[room]) {
        rooms[room] = {
          players: {},
          p_num: null,
          turnoCountdown: 30,
          countdownInterval: null,
          interRoundTime: 5,
          interRoundInterval: null
        };
      }

      // controllo capienza stanza
      const currentPlayersCount = Object.keys(rooms[room].players).length;
      if (currentPlayersCount >= MAX_PLAYERS_PER_ROOM) {
        // manda errore al client e non lo aggiunge
        socket.send(JSON.stringify({ type: 'error', message: 'Stanza piena' }));
        console.log(`❌ [${room}] Player${id} rifiutato: stanza piena`);
        return;
      }

      // aggiungi player alla stanza
      rooms[room].players[id] = players[id];

      // collega il socket alla stanza (usato dal broadcast)
      socket.room = room;

      // invia init con lo stato della stanza
      socket.send(JSON.stringify({
        type: 'init',
        id,
        players: rooms[room].players,
        room
      }));

      // notifica agli altri nella stanza che un nuovo player è entrato
      broadcastToRoom(room, { type: 'player_joined', id, nickname });

      console.log(`👤 Player${id} (${nickname}) è entrato nella stanza ${room}`);

      // Se vuoi partire automaticamente quando i primi player entrano:
      // esempio: se è il primo player non partire; se sono 1+ allora puoi scegliere di partire manualmente.
      // Qui non avviamo automaticamente un round: si parte quando qualcuno fa RequestNumero

    // Guess
    } else if (msg.type === 'Guess' && msg.Risposta) {
      const room = players[id].room;
      if (!room || !rooms[room]) {
        socket.send(JSON.stringify({ type: 'error', message: 'Non sei in una stanza valida' }));
        return;
      }
      const currentRoom = rooms[room];
      if (!currentRoom.p_num) {
        socket.send(JSON.stringify({ type: 'error', message: 'Nessun Pokémon attivo ora' }));
        return;
      }

      const risposta = String(msg.Risposta).trim();
      const distanza = Levenshtein.get(risposta.toLowerCase(), currentRoom.p_num.name.toLowerCase());
      console.log(`🤔 Player${id} (${players[id].nickname}) tenta: "${risposta}" (distanza ${distanza}) in stanza ${room}`);

      if (distanza < 2) {
        currentRoom.players[id].punteggio = (currentRoom.players[id].punteggio || 0) + 1;
        console.log(`✅ [${room}] RISPOSTA CORRETTA da Player${id}! Punteggio: ${currentRoom.players[id].punteggio}`);

        // Invia messaggio Correct con info pokemon e chi ha risposto
        broadcastToRoom(room, { type: 'Correct', msg: { Risposta: risposta, playerId: id, nickname: players[id].nickname }, pokemon: { numero: currentRoom.p_num.numero, nome: currentRoom.p_num.name } });

        // Ferma countdown stanza
        if (currentRoom.countdownInterval) {
          clearInterval(currentRoom.countdownInterval);
          currentRoom.countdownInterval = null;
        }

        // Mostra nome e termina round (inizia inter-round)
        InviaNome(room);
        TerminaRound(room);

      } else {
        console.log(`❌ [${room}] Risposta sbagliata di Player${id}`);
        broadcastToRoom(room, { type: 'Wrong', msg: { Risposta: risposta, playerId: id, nickname: players[id].nickname } });
      }

    // RequestNumero (start round)
    } else if (msg.type === 'RequestNumero') {
      const room = players[id].room;
      if (!room || !rooms[room]) {
        socket.send(JSON.stringify({ type: 'error', message: 'Non sei in una stanza valida' }));
        return;
      }
      console.log(`🔢 Player${id} richiede il numero del Pokémon in stanza ${room}`);
      Invianumero(room);

    // RequestNome (reveals)
    } else if (msg.type === 'RequestNome') {
      const room = players[id].room;
      if (!room || !rooms[room]) {
        socket.send(JSON.stringify({ type: 'error', message: 'Non sei in una stanza valida' }));
        return;
      }
      console.log(`📛 Player${id} richiede il nome del Pokémon in stanza ${room}`);
      InviaNome(room);
    }
  });

  socket.on('close', () => {
    console.log(`🔴 Player${id} disconnesso`);
    const player = players[id];
    if (player && player.room && rooms[player.room]) {
      const room = player.room;
      // rimuovi dalla stanza
      delete rooms[room].players[id];
      // notifica stanza
      broadcastToRoom(room, { type: 'remove', id });

      // se stanza vuota, pulisci timers e stanza
      if (Object.keys(rooms[room].players).length === 0) {
        if (rooms[room].countdownInterval) clearInterval(rooms[room].countdownInterval);
        if (rooms[room].interRoundInterval) clearInterval(rooms[room].interRoundInterval);
        delete rooms[room];
        console.log(`🗑️ Stanza ${room} rimossa (vuota)`);
      }
    }

    // rimuovi player globale
    delete players[id];
  });

}); // end wss.on

// Avvio server
const PORT = 5500;
server.listen(PORT, () => console.log(`✅ Server in ascolto sulla porta ${PORT}`));
