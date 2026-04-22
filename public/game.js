const socket = io();

const ROWS = 6;
const COLS = 7;

let myColor = null;
let myName = null;
let myId = null;
let currentTurn = null;
let players = [];
let board = [];
let gameActive = false;

// Screens
const lobbyEl = document.getElementById('lobby');
const waitingEl = document.getElementById('waiting');
const gameEl = document.getElementById('game');
const overlayEl = document.getElementById('overlay');

// Lobby elements
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const lobbyError = document.getElementById('lobby-error');

// Waiting elements
const displayRoomId = document.getElementById('display-room-id');
const btnCopy = document.getElementById('btn-copy');

// Game elements
const boardEl = document.getElementById('board');
const colArrowsEl = document.getElementById('col-arrows');
const statusText = document.getElementById('status-text');
const badgeP1 = document.getElementById('badge-p1');
const badgeP2 = document.getElementById('badge-p2');
const btnRestart = document.getElementById('btn-restart');
const overlayText = document.getElementById('overlay-text');
const btnOverlayRestart = document.getElementById('btn-overlay-restart');

function show(el) {
  [lobbyEl, waitingEl, gameEl].forEach(e => e.classList.add('hidden'));
  el.classList.remove('hidden');
}

// --- Lobby ---
btnCreate.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) { lobbyError.textContent = 'Entrez votre prénom.'; return; }
  lobbyError.textContent = '';
  socket.emit('create_room', { name });
});

btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const roomId = roomCodeInput.value.trim().toUpperCase();
  if (!name) { lobbyError.textContent = 'Entrez votre prénom.'; return; }
  if (!roomId) { lobbyError.textContent = 'Entrez un code de salle.'; return; }
  lobbyError.textContent = '';
  socket.emit('join_room', { name, roomId });
});

playerNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnCreate.click(); });
roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });

btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(displayRoomId.textContent).then(() => {
    btnCopy.textContent = 'Copié !';
    setTimeout(() => { btnCopy.textContent = 'Copier le code'; }, 1500);
  });
});

// --- Socket events ---
socket.on('room_created', ({ roomId, color, name }) => {
  myColor = color;
  myName = name;
  myId = socket.id;
  displayRoomId.textContent = roomId;
  show(waitingEl);
});

socket.on('room_joined', ({ color, name }) => {
  myColor = color;
  myName = name;
  myId = socket.id;
});

socket.on('game_start', (data) => {
  players = data.players;
  board = data.board;
  currentTurn = data.currentTurn;
  gameActive = true;
  overlayEl.classList.add('hidden');
  show(gameEl);
  btnRestart.classList.add('hidden');
  renderBadges();
  renderBoard();
  renderArrows();
  updateStatus();
});

socket.on('game_update', (data) => {
  board = data.board;
  currentTurn = data.currentTurn;
  renderBoard();
  updateStatus();
  updateArrows();
});

socket.on('game_over', ({ winner, color }) => {
  gameActive = false;
  renderBoard();
  if (winner) {
    overlayText.textContent = color === myColor ? '🎉 Vous avez gagné !' : `${winner} a gagné !`;
  } else {
    overlayText.textContent = 'Match nul !';
  }
  overlayEl.classList.remove('hidden');
  btnRestart.classList.remove('hidden');
  updateArrows();
});

socket.on('opponent_left', () => {
  gameActive = false;
  overlayText.textContent = "Votre adversaire a quitté la partie.";
  overlayEl.classList.remove('hidden');
  btnRestart.classList.add('hidden');
  updateArrows();
});

socket.on('error', ({ message }) => {
  lobbyError.textContent = message;
});

// --- Restart ---
function sendRestart() {
  socket.emit('restart_game');
  overlayEl.classList.add('hidden');
}
btnRestart.addEventListener('click', sendRestart);
btnOverlayRestart.addEventListener('click', sendRestart);

// --- Rendering ---
function renderBadges() {
  [badgeP1, badgeP2].forEach((badge, i) => {
    const p = players[i];
    if (!p) { badge.innerHTML = ''; return; }
    badge.innerHTML = `<span class="dot" style="background:${p.color === 'red' ? '#e53935' : '#fdd835'}"></span>${p.name}`;
  });
}

function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (board[r][c] ? ' ' + board[r][c] : '');
      boardEl.appendChild(cell);
    }
  }
}

function renderArrows() {
  colArrowsEl.innerHTML = '';
  for (let c = 0; c < COLS; c++) {
    const btn = document.createElement('button');
    btn.className = 'arrow-btn';
    btn.textContent = '▼';
    btn.dataset.col = c;
    btn.addEventListener('click', () => handleDrop(c));
    colArrowsEl.appendChild(btn);
  }
  updateArrows();
}

function updateArrows() {
  const arrows = colArrowsEl.querySelectorAll('.arrow-btn');
  const isMyTurn = gameActive && currentTurn === socket.id;
  arrows.forEach((btn, c) => {
    const colFull = board[0] && board[0][c] !== null;
    btn.disabled = !isMyTurn || colFull;
  });
}

function updateStatus() {
  if (!gameActive) { statusText.textContent = ''; return; }
  const activePlayer = players.find(p => p.id === currentTurn);
  if (!activePlayer) return;
  if (currentTurn === socket.id) {
    statusText.textContent = 'Votre tour';
  } else {
    statusText.textContent = `Tour de ${activePlayer.name}`;
  }
  // Highlight active badge
  players.forEach((p, i) => {
    const badge = i === 0 ? badgeP1 : badgeP2;
    badge.classList.toggle('active', p.id === currentTurn);
  });
}

function handleDrop(col) {
  if (!gameActive || currentTurn !== socket.id) return;
  socket.emit('drop_piece', { col });
}
