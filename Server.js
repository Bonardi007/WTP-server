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
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

// Configurazione armi
const WEAPONS = {
  pistol: { damage: 10, speed: 8, range: 800 },
  shotgun: { damage: 20, speed: 5, range: 600 }
};

// Stato del gioco
let players = {};
let bullets = [];
let idCounter = 0;
let pistolAmmoPacks = [];
let shotgunAmmoPacks = [];

// =============== FUNZIONI DI UTILITY ===============
// Invia messaggio a tutti i client connessi
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

// =============== GESTIONE MUNIZIONI E OGGETTI ===============
function spawnAmmo(type) {
    const ammoPack = {
        id: Math.random().toString(36).substring(2, 9),
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        type: type
    };

    if (type === 'pistol') {
        pistolAmmoPacks.push(ammoPack);
    } else if (type === 'shotgun') {
        shotgunAmmoPacks.push(ammoPack);
    }

    // Invia l'aggiornamento ai client
    broadcast({
        type: 'ammo_spawn',
        ammoPack
    });
}

function checkAmmoPickup() {
    for (let id in players) {
        const player = players[id];

        if (player.isAlive) {
            // Controllo munizioni pistola
            pistolAmmoPacks = pistolAmmoPacks.filter(pack => {
                if (Math.hypot(pack.x - player.x, pack.y - player.y) < 20) {
                    // Incrementa le munizioni sul client
                    broadcast({ 
                        type: 'ammo_pickup', 
                        playerId: id, 
                        weapon: 'pistol',
                        amount: 10
                    });
                    return false; // Rimuove l'oggetto dall'array
                }
                return true;
            });

            // Controllo munizioni fucile a pompa
            shotgunAmmoPacks = shotgunAmmoPacks.filter(pack => {
                if (Math.hypot(pack.x - player.x, pack.y - player.y) < 20) {
                    broadcast({ 
                        type: 'ammo_pickup', 
                        playerId: id, 
                        weapon: 'shotgun',
                        amount: 5
                    });
                    return false;
                }
                return true;
            });
        }
    }
}

// =============== AGGIORNAMENTO PROIETTILI E COLLISIONI ===============
function updateBullets() {
  for (let b of bullets) {
    b.x += b.dx;
    b.y += b.dy;
    b.life--;

    for (let pid in players) {
      if (pid != b.owner && players[pid] && players[pid].isAlive) {
        const p = players[pid];
        if (Math.hypot(p.x - b.x, p.y - b.y) < 12) {
          p.hp -= b.damage;

          if (p.hp <= 0) {
            p.isAlive = false;
            broadcast({ type: 'kill', killerId: b.owner, victimId: pid });
            broadcast({ type: 'died', id: pid });
          } else {
            broadcast({ type: 'update', id: pid, player: p });
          }
          b.life = 0;
        }
      }
    }
  }
  bullets = bullets.filter(b => b.life > 0);
  broadcast({ type: 'bullets', bullets });
}

// =============== GESTIONE CONNESSIONI WEBSOCKET ===============
wss.on('connection', socket => {
  const id = ++idCounter;

  // Inizializzazione del nuovo giocatore
  players[id] = { 
    x: Math.random() * MAP_WIDTH, 
    y: Math.random() * MAP_HEIGHT, 
    hp: 100, 
    nickname: 'Player' + id, 
    weapon: 'pistol',
    isAlive: true 
  };

  // Invia stato iniziale a questo client
  socket.send(JSON.stringify({ type: 'init', id, players }));
  
  // Notifica agli altri client il nuovo giocatore
  broadcast({ type: 'update', id, player: players[id] });

  socket.on('message', msgStr => {
    const msg = JSON.parse(msgStr);
    console.log(`[SERVER] Ricevuto messaggio:`, msg);

    // Non processare messaggi per giocatori non vivi
    if (!players[id]) return;
  
    // Gestione messaggi dal client
    if (msg.type === 'join' && msg.nickname) {
      // Imposta il nickname e reinizializza il giocatore
      players[id].nickname = msg.nickname;
      players[id].isAlive = true;
      players[id].hp = 100;
      players[id].x = Math.random() * MAP_WIDTH;
      players[id].y = Math.random() * MAP_HEIGHT;
      broadcast({ type: 'update', id, player: players[id] });
    }
    else if (msg.type === 'changeWeapon' && WEAPONS[msg.weapon]) {
      // Cambio arma
      players[id].weapon = msg.weapon;
      broadcast({ type: 'update', id, player: players[id] });
    }
    else if (msg.type === 'move' && players[id]) {
      // Aggiornamento posizione
      players[id].x = msg.x;
      players[id].y = msg.y;
      broadcast({ type: 'update', id, player: players[id] });
    } 
    else if (msg.type === 'shoot' && players[id]) {
      // Gestione sparo
      console.log(`[SERVER] Messaggio di sparo ricevuto da ${id} con arma ${msg.weapon}`);

      const weapon = WEAPONS[msg.weapon] || WEAPONS[players[id].weapon];
      bullets.push({
        x: players[id].x,
        y: players[id].y,
        dx: Math.cos(msg.angle) * weapon.speed,
        dy: Math.sin(msg.angle) * weapon.speed,
        owner: id,
        life: weapon.range / weapon.speed,
        damage: weapon.damage
      });
    }
    else if (msg.type === 'respawn' && players[id]) {
      // Gestione respawn
      players[id].hp = 100;
      players[id].isAlive = true;
      players[id].x = Math.random() * MAP_WIDTH;
      players[id].y = Math.random() * MAP_HEIGHT;
      players[id].ammo = { pistol: 15, shotgun: 5 }; // Ricarica munizioni
      
      broadcast({ type: 'respawned', id, player: players[id] });
    }
  });
  
  // Gestione disconnessione
  socket.on('close', () => {
    delete players[id];
    broadcast({ type: 'remove', id });
  });
});

// =============== TIMER E INTERVALLI ===============
// Aggiorna lo stato dei proiettili e delle collisioni
setInterval(updateBullets, 1000 / 30); // 30 fps

// Controlla pickup di munizioni
setInterval(checkAmmoPickup, 300);

// Genera nuove munizioni
setInterval(() => {
    spawnAmmo('pistol');
    spawnAmmo('shotgun');
}, 15000); // Ogni 15 secondi

// =============== AVVIO SERVER ===============
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Game server running on port ${PORT}`));