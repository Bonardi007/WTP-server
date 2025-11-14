
// =============== CONFIGURAZIONE E COSTANTI ===============
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

// =============== ELEMENTI DOM ===============
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const deathScreen = document.getElementById("deathScreen");
const respawnButton = document.getElementById("respawnButton");

// =============== CONFIGURAZIONE MINIMAPPA ===============
const minimap = document.createElement('canvas');
minimap.id = 'minimap';
minimap.width = 200;
minimap.height = 200;
document.body.appendChild(minimap);
const minimapCtx = minimap.getContext('2d');
const MINIMAP_SCALE = 0.067; // Ratio per ridimensionamento della minimappa

// =============== CONFIGURAZIONE CONTATORE UCCISIONI ===============
const killCounterDiv = document.createElement('div');
killCounterDiv.id = 'killCounter';
killCounterDiv.style.position = 'fixed';
killCounterDiv.style.top = '230px';
killCounterDiv.style.right = '20px';
killCounterDiv.style.color = 'white';
killCounterDiv.style.backgroundColor = 'rgba(44, 48, 54, 0.7)';
killCounterDiv.style.padding = '10px';
killCounterDiv.style.borderRadius = '8px';
killCounterDiv.innerText = `Kills: 0`;
document.body.appendChild(killCounterDiv);
killCounterDiv.style.display = 'none';

// =============== CONNESSIONE WEBSOCKET ===============
const socket = new WebSocket('wss://wtp-server-k97x.onrender.com');

// =============== CARICAMENTO IMMAGINI ===============
// Mappa
const mappaSVG = new Image();
mappaSVG.src = 'img/game_map.svg';

// Personaggi
const pistolSVG = new Image();
pistolSVG.src = 'img/pistol_character.svg';
const shotgunSVG = new Image();
shotgunSVG.src = 'img/rifle_character.svg';

// Proiettili e oggetti
const bulletImage = new Image();
bulletImage.src = 'img/bullet.png';
const pistolAmmoImg = new Image();
pistolAmmoImg.src = 'img/rifle.png';
const shotgunAmmoImg = new Image();
shotgunAmmoImg.src = 'img/shotgun.png';

// =============== STATO DEL GIOCO ===============
let players = {};
let bullets = [];
let myId = null;
let nickname = null;
let gameStarted = false;
let isLoggedIn = false;
let selectedWeapon = "pistol";
let killCount = 0;
let pistolAmmoPacks = [];
let shotgunAmmoPacks = [];
let ammo = {
    pistol: 15,
    shotgun: 5
};

// =============== INPUT UTENTE ===============
const keys = {};
let mouse = { x: 0, y: 0 };

// =============== EVENT LISTENERS ===============
// Controlli tastiera e mouse
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);
canvas.addEventListener('mousemove', e => {
    mouse.x = e.offsetX;
    mouse.y = e.offsetY;
});

// Gestione sparo
canvas.addEventListener('mousedown', e => {
    if (gameStarted) {
        const me = players[myId];

        // Calcoliamo la posizione attuale sul canvas
        let drawX = canvas.width / 2;
        let drawY = canvas.height / 2;

        // Compensazione ai bordi
        if (me.x < canvas.width / 2) drawX = me.x;
        if (me.y < canvas.height / 2) drawY = me.y;
        if (me.x > MAP_WIDTH - canvas.width / 2) drawX = canvas.width - (MAP_WIDTH - me.x);
        if (me.y > MAP_HEIGHT - canvas.height / 2) drawY = canvas.height - (MAP_HEIGHT - me.y);

        // Calcolo dell'angolo rispetto al centro del personaggio sul canvas
        const angle = Math.atan2(e.clientY - drawY, e.clientX - drawX);

        // Invia il messaggio di sparo al server
        if (selectedWeapon === "pistol" && ammo.pistol > 0) {
            ammo.pistol--;
            socket.send(JSON.stringify({ type: 'shoot', weapon: 'pistol', angle }));
        } else if (selectedWeapon === "shotgun" && ammo.shotgun > 0) {
            ammo.shotgun--;
            socket.send(JSON.stringify({ type: 'shoot', weapon: 'shotgun', angle }));
        }
        
        updateWeaponUI();
    }
});

// Gestione pulsante respawn
respawnButton.addEventListener("click", () => {
    console.log("Tentativo di respawn...");
    socket.send(JSON.stringify({ type: 'respawn', id: myId }));
    console.log("Messaggio di respawn inviato al server");

    // Nascondi schermata di morte
    deathScreen.classList.add("hidden");
    console.log("Schermata di morte nascosta");

    // Log stato gioco
    console.log("Gioco ripartito:", gameStarted);
});

// Gestione cambio arma
document.getElementById('pistol').addEventListener('click', () => {
    selectedWeapon = "pistol";
    players[myId].weapon = "pistol";
    socket.send(JSON.stringify({ type: 'changeWeapon', weapon: 'pistol' }));
});

document.getElementById('shotgun').addEventListener('click', () => {
    selectedWeapon = "shotgun";
    players[myId].weapon = "shotgun";
    socket.send(JSON.stringify({ type: 'changeWeapon', weapon: 'shotgun' }));
});

// Gestione pulsante "Gioca"
document.getElementById('playButton').addEventListener('click', () => {
    const nicknameInput = document.getElementById('nicknameInput');
    const startScreen = document.getElementById('startScreen');
    
    isLoggedIn = true;
    nickname = nicknameInput.value.trim();
    const minLength = 3;
    const maxLength = 16;
    const nicknameRegex = /^[a-zA-Z0-9_]+$/; // Solo lettere, numeri e underscore
    
    if (nickname.length < minLength || nickname.length > maxLength) {
        alert(`Il nickname deve essere tra ${minLength} e ${maxLength} caratteri.`);
        return;
    }
    
    if (!nicknameRegex.test(nickname)) {
        alert("Il nickname può contenere solo lettere, numeri e underscore (_).");
        return;
    }
    
    // Nascondi schermata di login
    if (startScreen) {
        startScreen.style.display = 'none';
    }
    
    gameStarted = true;
    
    // Mostra elementi di gioco
    killCounterDiv.style.display = 'block';
    
    // Log per vedere cosa viene inviato
    console.log('Invio nickname al server:', nickname);
    
    // Invia al server il nickname
    socket.send(JSON.stringify({ type: 'join', nickname }));
});

// =============== GESTIONE MESSAGGI WEBSOCKET ===============
socket.onmessage = event => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'init') {
        myId = msg.id;
        players = msg.players;
    } else if (msg.type === 'update') {
        players[msg.id] = msg.player;
    } else if (msg.type === 'remove') {
        delete players[msg.id];
    } else if (msg.type === 'bullets') {
        bullets = msg.bullets;
    } else if (msg.type === 'kill') {
        if (msg.killerId === myId) {
            killCount++;
            updateKillCounter();
        }
    } else if (msg.type === 'died') {
        if (players[msg.id]) {
            players[msg.id].isAlive = false;
        }
        // Mostra schermata di morte se il giocatore è morto
        if (Number(msg.id) === myId) {
            gameStarted = false;    
            deathScreen.classList.remove("hidden");
        }   
    } else if (msg.type === 'respawned') {
        if (Number(msg.id) === myId) {
            gameStarted = true;
            deathScreen.classList.add("hidden");
            players[myId] = msg.player;
            document.getElementById('game').style.filter = "none";
            updateMinimap(players);
        } else {
            console.log("❌ Il messaggio di respawn non è per me.");
        }
    }
};

// =============== FUNZIONI DI GESTIONE INTERFACCIA ===============
function showLoginScreen() {
    const startScreen = document.getElementById('startScreen');
    if (startScreen) {
        startScreen.style.display = 'flex';
        
        // Pre-fill del campo nickname
        const nicknameInput = document.getElementById('nicknameInput');
        if (nicknameInput && nickname) {
            nicknameInput.value = nickname;
        }
    }
    
    // Resetta lo stato del gioco
    gameStarted = false;
    isLoggedIn = false;
    players = {};
    bullets = [];
    killCount = 0;
    
    // Nascondi elementi di gioco
    killCounterDiv.style.display = 'none';
    
    // Aggiorna la minimappa anche se il giocatore non è ancora loggato
    updateMinimap(players);
}

function updateKillCounter() {
    killCounterDiv.innerText = `Kills: ${killCount}`;
}

function updateWeaponUI() {
    document.getElementById('pistol').innerText = `Pistola (${ammo.pistol})`;
    document.getElementById('shotgun').innerText = `Fucile (${ammo.shotgun})`;
}

// =============== FUNZIONI DI RENDERING ===============
function updateMinimap(players) {
    minimapCtx.clearRect(0, 0, minimap.width, minimap.height);

    // Disegna l'intera mappa SVG ridimensionata
    minimapCtx.drawImage(mappaSVG, 0, 0, MAP_WIDTH * MINIMAP_SCALE, MAP_HEIGHT * MINIMAP_SCALE);

    // Disegna i giocatori, ma non disegnarli se non è loggato
    for (const id in players) {
        const p = players[id];
        if (isLoggedIn) {
            minimapCtx.fillStyle = id === myId ? 'green' : 'blue';
        } else {
            minimapCtx.fillStyle = 'gray'; // Colore dei giocatori non visibili durante il login
        }
        minimapCtx.fillRect(p.x * MINIMAP_SCALE, p.y * MINIMAP_SCALE, 5, 5);
    }

    // Munizioni Pistola
    minimapCtx.fillStyle = 'yellow';
    pistolAmmoPacks.forEach(pack => {
        minimapCtx.fillRect(pack.x * MINIMAP_SCALE, pack.y * MINIMAP_SCALE, 3, 3);
    });

    // Munizioni Fucile a Pompa
    minimapCtx.fillStyle = 'orange';
    shotgunAmmoPacks.forEach(pack => {
        minimapCtx.fillRect(pack.x * MINIMAP_SCALE, pack.y * MINIMAP_SCALE, 3, 3);
    });
}

function drawPlayer(player, isSelf = false, offsetX = 0, offsetY = 0) {
    if (!gameStarted || !player) return;

    const sprite = player.weapon === "pistol" ? pistolSVG : shotgunSVG;

    // Calcolo delle coordinate effettive di disegno sul canvas
    let drawX, drawY;
    if (isSelf) {
        // Giocatore Locale — Sempre al centro
        drawX = canvas.width / 2;
        drawY = canvas.height / 2;

        // Compensazione ai bordi
        if (players[myId].x < canvas.width / 2) drawX = players[myId].x;
        if (players[myId].y < canvas.height / 2) drawY = players[myId].y;
        if (players[myId].x > MAP_WIDTH - canvas.width / 2) drawX = canvas.width - (MAP_WIDTH - players[myId].x);
        if (players[myId].y > MAP_HEIGHT - canvas.height / 2) drawY = canvas.height - (MAP_HEIGHT - players[myId].y);

    } else {
        // Giocatori Remoti — In base all'offset di telecamera
        drawX = player.x - offsetX;
        drawY = player.y - offsetY;
    }

    // Calcolo dell'angolo corretto rispetto al mouse
    const angle = Math.atan2(mouse.y - drawY, mouse.x - drawX);

    ctx.save(); // Salva lo stato del contesto

    // Trasla al centro del personaggio nel canvas
    ctx.translate(drawX, drawY);

    // Ruota l'immagine
    ctx.rotate(angle + Math.PI / 2);

    // Disegna l'immagine centrata sul personaggio
    ctx.drawImage(sprite, -40, -40, 80, 80);

    ctx.restore(); // Ripristina lo stato precedente del contesto

    // Nickname sopra il giocatore
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(player.nickname || 'Player', drawX, drawY - 50);

    // HP sotto il nickname
    ctx.fillText(player.hp + " HP", drawX, drawY + 50);
}

function drawBullet(bullet, offsetX = 0, offsetY = 0) {
    ctx.save();
    ctx.translate(bullet.x - offsetX, bullet.y - offsetY);
    const angle = Math.atan2(bullet.dy, bullet.dx);
    ctx.rotate(angle);
    ctx.drawImage(bulletImage, -5, -5, 10, 10);
    ctx.restore();
}

function drawAmmoPacks(offsetX = 0, offsetY = 0) {
    const size = 40; // Dimensione dell'immagine
    // Munizioni Pistola
    pistolAmmoPacks.forEach(pack => {
       ctx.drawImage(pistolAmmoImg, pack.x - offsetX - size / 2, pack.y - offsetY - size / 2, size, size);
    });

    // Munizioni Fucile a Pompa
    shotgunAmmoPacks.forEach(pack => {
        ctx.drawImage(shotgunAmmoImg, pack.x - offsetX - size / 2, pack.y - offsetY - size / 2, size, size);
    });
}

// =============== GESTIONE OGGETTI DI GIOCO ===============
function spawnAmmo(type) {
    const ammoPack = {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        type: type
    };
    if (type === 'pistol') {
        pistolAmmoPacks.push(ammoPack);
    } else if (type === 'shotgun') {
        shotgunAmmoPacks.push(ammoPack);
    }
}

function checkAmmoPickup() {
    const me = players[myId];

    // Pistola
    pistolAmmoPacks = pistolAmmoPacks.filter(pack => {
        const distance = Math.hypot(me.x - pack.x, me.y - pack.y);
        if (distance < 20) {
            ammo.pistol += 10; // Aggiunge 10 colpi
            updateWeaponUI();
            return false; // Rimuove il pacco
        }
        return true;
    });

    // Fucile a Pompa
    shotgunAmmoPacks = shotgunAmmoPacks.filter(pack => {
        const distance = Math.hypot(me.x - pack.x, me.y - pack.y);
        if (distance < 20) {
            ammo.shotgun += 5; // Aggiunge 5 colpi
            updateWeaponUI();
            return false;
        }
        return true;
    });
}

// =============== GAME LOOP ===============
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameStarted && myId && players[myId]) {
        let me = players[myId];

        // Movimento limitato ai bordi della mappa
        if (keys['w'] && me.y > 0) me.y -= 2;
        if (keys['s'] && me.y < MAP_HEIGHT - 10) me.y += 2;
        if (keys['a'] && me.x > 0) me.x -= 2;
        if (keys['d'] && me.x < MAP_WIDTH - 10) me.x += 2;

        // Inviamo subito al server il movimento
        socket.send(JSON.stringify({ type: 'move', x: me.x, y: me.y }));

        // Calcolo dell'offset della camera
        const offsetX = Math.max(0, Math.min(me.x - canvas.width / 2, MAP_WIDTH - canvas.width));
        const offsetY = Math.max(0, Math.min(me.y - canvas.height / 2, MAP_HEIGHT - canvas.height));

        // Disegna la mappa
        ctx.drawImage(mappaSVG, -offsetX, -offsetY, MAP_WIDTH, MAP_HEIGHT);

        // Disegna i giocatori con offset di camera
        for (let id in players) {
            const p = players[id];
            if (p.isAlive && 
                p.x > offsetX - 50 && p.x < offsetX + canvas.width + 50 &&
                p.y > offsetY - 50 && p.y < offsetY + canvas.height + 50) {
                drawPlayer(p, id === myId, offsetX, offsetY);
            }
        }

        // Disegna i proiettili con offset di camera
        for (let bullet of bullets) {
            if (bullet.x > offsetX && bullet.x < offsetX + canvas.width &&
                bullet.y > offsetY && bullet.y < offsetY + canvas.height) {
                drawBullet(bullet, offsetX, offsetY);
            }
        }

        drawAmmoPacks(offsetX, offsetY);
        checkAmmoPickup();

        // Aggiorna la minimappa
        updateMinimap(players);
    }

    requestAnimationFrame(gameLoop);
}

// =============== INIZIALIZZAZIONE E TIMER ===============
// Spawn munizioni ogni 15 secondi
setInterval(() => {
    spawnAmmo('pistol');
    spawnAmmo('shotgun');
}, 15000);

// Avvio del game loop
gameLoop();
