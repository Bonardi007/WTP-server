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

// =============== COSTANTI E VARIABILI GLOBALI ===============
let num_pokedex = 0;
let idCounter = 0;
let players = {};
let p_num;

// Dopo aver creato il server
server.listen(3000, () => {
  console.log('Server in ascolto sulla porta 3000');
});

// Nel broadcast
function broadcast(message) {
  const serializedMessage = JSON.stringify(message);
  console.log('[SERVER] Invio messaggio a tutti:', message); // <-- log
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

// Nel WebSocket connection
wss.on('connection', socket => {
  const id = ++idCounter;
  console.log(`[SERVER] Nuovo client connesso, ID: ${id}`);

  socket.on('message', msgStr => {
    const msg = JSON.parse(msgStr);
    console.log(`[SERVER] Ricevuto dal client ${id}:`, msg);
  });

  socket.on('close', () => {
    console.log(`[SERVER] Client ${id} disconnesso`);
  });
});


// Funzione: prende Pokémon casuale
function getPokemonRandom() {
  const lista = pokedex.pokemons;
  const index = Math.floor(Math.random() * lista.length);
  console.log(`🎲 Pokémon random scelto: ${lista[index].name} (#${lista[index].numero})`);
  return lista[index];
}

// Invia numero al client
function Invianumero() {
  const p = getPokemonRandom();
  p_num = p;

  const pokemon = { numero: p.numero };
  console.log("➡️ Inviando numero Pokémon:", pokemon);

  broadcast({ type: 'invio_numero', pokemon });
}

// Invia nome al client
function InviaNome() {
  if (!p_num) {
    console.log("⚠️ Tentato invio nome, ma p_num non è impostato!");
    return;
  }

  const pokemon = { nome: p_num.name };
  console.log("➡️ Inviando nome Pokémon:", pokemon);

  broadcast({ type: 'invio_nome', pokemon });
}

// =============== GESTIONE CONNESSIONI WEBSOCKET ===============
wss.on('connection', socket => {
  const id = ++idCounter;

  players[id] = { 
    punteggio: 0,
    nickname: 'Player' + id,
  };

  console.log(`🟢 Nuova connessione → Player${id}`);

  // Invia stato iniziale
  socket.send(JSON.stringify({ type: 'init', id, players }));
  console.log(`📨 Inviato init a Player${id}`);

  // Ricezione messaggi dal client
  socket.on('message', msgStr => {
    const msg = JSON.parse(msgStr);
    console.log(`📥 [SERVER] Ricevuto da Player${id}:`, msg);

    if (!players[id]) {
      console.log(`⚠️ Messaggio ignorato: Player${id} non esiste più`);
      return;
    }

    // ====== Gestione messaggi client ======
    if (msg.type === 'Join' && msg.nickname) {
      players[id].nickname = msg.nickname;
      console.log(`👤 Player${id} ha impostato il nickname → ${msg.nickname}`);

    } else if (msg.type === 'Guess' && msg.Risposta) {
      console.log(`🤔 Player${id} ha tentato: "${msg.Risposta}"`);
      const distanza = Levenshtein.get(msg.Risposta.toLowerCase(), p_num.name.toLowerCase());
      if (distanza < 2) {
        players[id].punteggio++;
        console.log(`✅ RISPOSTA CORRETTA da Player${id}!`);
        broadcast({ type: 'Correct', msg });
        InviaNome();
      } else {
        console.log(`❌ Risposta sbagliata di Player${id}`);
        broadcast({ type: 'Wrong', msg });
      }
    }

    // Messaggi aggiuntivi se li userai:
    if (msg.type === 'RequestNumero') {
      console.log(`🔢 Player${id} richiede il numero del Pokémon`);
      Invianumero();
    }

    if (msg.type === 'RequestNome') {
      console.log(`📛 Player${id} richiede il nome del Pokémon`);
      InviaNome();
    }
  });

  // Disconnessione
  socket.on('close', () => {
    console.log(`🔴 Player${id} disconnesso`);
    delete players[id];
    broadcast({ type: 'remove', id });
  });
});
