// =============== DIPENDENZE ===============
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pokedex = require('./Pokedex.json');
const Levenshtein = require('fast-levenshtein');

// =============== CONFIGURAZIONE SERVER ===============
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servire file statici
app.use(express.static(path.join(__dirname)));

// =============== VARIABILI GLOBALI ===============
let idCounter = 0;
let players = {};
let p_num; // Pokémon corrente

// Timer turno
let turnoCountdown = 30;
let countdownInterval;

// Timer inter-round
let interRoundTime = 5;
let interRoundInterval;

// =============== SERVER IN ASCOLTO ===============
server.listen(3000, () => {
  console.log('✅ Server in ascolto sulla porta 3000');
});

// =============== FUNZIONI UTILI ===============
function broadcast(message) {
  const serializedMessage = JSON.stringify(message);
  console.log('[SERVER] Broadcast:', message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serializedMessage);
    }
  });
}

function getPokemonRandom() {
  const lista = pokedex.pokemons;
  const index = Math.floor(Math.random() * lista.length);
  console.log(`🎲 Pokémon random scelto: ${lista[index].name} (#${lista[index].numero})`);
  return lista[index];
}

// Invia numero Pokémon e avvia countdown turno
function Invianumero() {
  const p = getPokemonRandom();
  p_num = p;

  console.log(`➡️ Inviando numero Pokémon: #${p.numero}`);
  broadcast({ type: 'invio_numero', pokemon: { numero: p.numero } });

  // Reset countdown turno
  clearInterval(countdownInterval);
  turnoCountdown = 30;
  console.log(`⏱️ Countdown turno: ${turnoCountdown}s`);

  countdownInterval = setInterval(() => {
    broadcast({ type: 'countdown', remaining: turnoCountdown });
    console.log(`[TIMER] Tempo rimanente turno: ${turnoCountdown}s`);
    turnoCountdown--;

    if (turnoCountdown < 0) {
      clearInterval(countdownInterval);
      console.log("⏰ Tempo scaduto! Mostro il nome del Pokémon");
      InviaNome();
      TerminaRound();
    }
  }, 1000);
}

// Invia nome Pokémon corrente
function InviaNome() {
  if (!p_num) {
    console.log("⚠️ Tentato invio nome, ma p_num non è impostato!");
    return;
  }
  console.log(`➡️ Inviando nome Pokémon: ${p_num.name}`);
  broadcast({ type: 'invio_nome', pokemon: { nome: p_num.name,numero: p_num.numero} });
}

// Countdown inter-round
function TerminaRound() {
  clearInterval(interRoundInterval);
  interRoundTime = 5;
  console.log(`🔄 Intervallo tra i round: ${interRoundTime}s`);

  interRoundInterval = setInterval(() => {
    broadcast({ type: 'countdown', remaining: interRoundTime });
    console.log(`[INTER-ROUND] Tempo rimanente: ${interRoundTime}s`);
    interRoundTime--;

    if (interRoundTime < 0) {
      clearInterval(interRoundInterval);
      console.log("➡️ Inizio nuovo round");
      Invianumero();
    }
  }, 1000);
}

// =============== GESTIONE CONNESSIONI WEBSOCKET ===============
wss.on('connection', socket => {
  const id = ++idCounter;

  players[id] = {
    punteggio: 0,
    nickname: 'Player' + id
  };

  console.log(`🟢 Nuova connessione → Player${id}`);

  // Invia stato iniziale al nuovo giocatore
  socket.send(JSON.stringify({ type: 'init', id, players }));
  console.log(`📨 Inviato init a Player${id}:`, players[id]);

  // Ricezione messaggi dal client
  socket.on('message', msgStr => {
    const msg = JSON.parse(msgStr);
    console.log(`📥 Ricevuto da Player${id}:`, msg);

    if (!players[id]) return; // Player disconnesso

    // Imposta nickname
    if (msg.type === 'Join' && msg.nickname) {
      players[id].nickname = msg.nickname;
      console.log(`👤 Player${id} ha impostato il nickname: ${msg.nickname}`);

    // Tentativo di risposta
    } else if (msg.type === 'Guess' && msg.Risposta) {
      console.log(`🤔 Player${id} tenta: "${msg.Risposta}"`);
      const distanza = Levenshtein.get(msg.Risposta.toLowerCase(), p_num.name.toLowerCase());

      if (distanza < 2) {
        players[id].punteggio++;
        console.log(`✅ RISPOSTA CORRETTA da Player${id}! Punteggio: ${players[id].punteggio}`);
        broadcast({ type: 'Correct', msg });

        clearInterval(countdownInterval); // ferma countdown turno
        InviaNome();
        TerminaRound();
      } else {
        console.log(`❌ Risposta sbagliata di Player${id}`);
        broadcast({ type: 'Wrong', msg });
      }

    // Richiesta numero o nome
    } else if (msg.type === 'RequestNumero') {
      console.log(`🔢 Player${id} richiede il numero del Pokémon`);
      Invianumero();
    } else if (msg.type === 'RequestNome') {
      console.log(`📛 Player${id} richiede il nome del Pokémon`);
      InviaNome();
    }
  });

  // Disconnessione
  socket.on('close', () => {
    console.log(`🔴 Player${id} disconnesso`);
    delete players[id];
    broadcast({ type: 'remove', id });
    if(Object.keys(players).length===0){
      clearInterval(interRoundInterval);
      clearInterval(countdownInterval);
      console.log(`Nessun Giocatore Online`);
    }
  });
});

/* =============== AVVIO PRIMO ROUND ===============
console.log('🏁 Avvio primo round...');
Invianumero();*/
