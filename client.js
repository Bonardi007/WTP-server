const logBox = document.getElementById('log');
const pokemonImg = document.getElementById('pokemon');
const guessInput = document.getElementById('guess');

function log(msg) {
  logBox.innerHTML += msg + "<br>";
  logBox.scrollTop = logBox.scrollHeight;
}

const socket = new WebSocket("wss://wtp-server-k97x.onrender.com");

const nickname = sessionStorage.getItem("nickname") || "Player";
let myId = null;

socket.onopen = () => {
  log("🔗 Connesso al server");
  socket.send(JSON.stringify({ type: 'Join', nickname }));
  log("👤 Join inviato: " + nickname);
};

socket.onmessage = evt => {
  const msg = JSON.parse(evt.data);

  switch(msg.type) {
    case 'init':
      myId = msg.id;
      log("🆗 Inizializzato! ID: " + myId);
      break;

    case 'invio_numero':
      pokemonImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${msg.pokemon.numero}.png`;
      log("📟 Numero Pokémon ricevuto: " + msg.pokemon.numero);
      break;

    case 'invio_nome':
      pokemonImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${msg.pokemon.numero}.png`;
      log("🔤 Nome Pokémon ricevuto: " + msg.pokemon.nome);
      break;

    case 'Correct':
      log("✅ Risposta corretta di: " + msg.msg.Risposta);
      break;

    case 'Wrong':
      log("❌ Risposta sbagliata di: " + msg.msg.Risposta);
      break;

    case 'remove':
      log("🚪 Giocatore disconnesso: " + msg.id);
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
