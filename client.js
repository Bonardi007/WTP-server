const logBox = document.getElementById('log');
const pokemonImg = document.getElementById('pokemon');
const guessInput = document.getElementById('guess');

function log(msg) {
  logBox.innerHTML += msg + "<br>";
  logBox.scrollTop = logBox.scrollHeight;
}

// Recupera dati da sessionStorage (salvati in lobby)
const nickname = sessionStorage.getItem("nickname") || "Player";
const room = sessionStorage.getItem("room") || "ABCDE";
let myId = null;

// Apri WebSocket solo qui, in game.html
const socket = new WebSocket("https://wtp-server-k97x.onrender.com");

socket.onopen = () => {
  log("🔗 Connesso al server");
  socket.send(JSON.stringify({ type: 'Join', nickname, room }));
  log(`👤 Join inviato: ${nickname} nella stanza ${room}`);
};

socket.onmessage = evt => {
  const msg = JSON.parse(evt.data);

  if (msg.type === 'error') {
    window.location.href = "index.html";
    alert(msg.message); // es. stanza piena
    socket.close();
    return;
  }

  switch(msg.type) {
    case 'init':
      myId = msg.id;
      log(`🆗 Inizializzato! ID: ${myId}`);
      break;

    case 'invio_numero':
      pokemonImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${msg.pokemon.numero}.png`;
      pokemonImg.style.filter = "brightness(0)";
      log("📟 Numero Pokémon ricevuto: " + msg.pokemon.numero);
      break;

    case 'invio_nome':
      pokemonImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${msg.pokemon.numero}.png`;
      pokemonImg.style.filter = "brightness(1)";
      log("🔤 Nome Pokémon ricevuto: " + msg.pokemon.nome);
      break;

    case 'Correct':
      log(`✅ Risposta corretta: ${msg.msg.Risposta} di ${msg.msg.nickname}`);
      break;

    case 'Wrong':
      log(`❌ Risposta sbagliata: ${msg.msg.Risposta} di ${msg.msg.nickname}`);
      break;

    case 'remove':
      log(`🚪 Giocatore disconnesso: ${msg.id}`);
      break;

    case 'countdown':
      document.getElementById('timer').textContent = msg.remaining;
      break;
  }
};

// ====== FUNZIONI CLIENT ======
document.getElementById('send').onclick = () => {
  const Risposta = guessInput.value.trim();
  if (!Risposta) return;
  socket.send(JSON.stringify({ type: 'Guess', Risposta }));
  log("🎯 Guess inviato: " + Risposta);
  guessInput.value = "";
};

document.getElementById('requestNumber').onclick = () => {
  socket.send(JSON.stringify({ type: 'RequestNumero' }));
  log("🔢 Richiesto numero Pokémon");
};

document.getElementById('requestName').onclick = () => {
  socket.send(JSON.stringify({ type: 'RequestNome' }));
  log("📛 Richiesto nome Pokémon");
};
