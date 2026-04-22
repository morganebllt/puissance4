const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const ROWS = 6;
const COLS = 7;

// rooms: { [roomId]: { players: [{id, name, color}], board, currentTurn, gameOver } }
const rooms = {};

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function dropPiece(board, col, color) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (!board[row][col]) {
      board[row][col] = color;
      return row;
    }
  }
  return -1;
}

function checkWin(board, row, col, color) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

function isDraw(board) {
  return board[0].every(cell => cell !== null);
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      players: [{ id: socket.id, name, color: 'red' }],
      board: createBoard(),
      currentTurn: socket.id,
      gameOver: false,
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('room_created', { roomId, color: 'red', name });
  });

  socket.on('join_room', ({ name, roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('error', { message: 'Salle introuvable.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'La salle est pleine.' });
      return;
    }
    room.players.push({ id: socket.id, name, color: 'yellow' });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('room_joined', { roomId, color: 'yellow', name });
    io.to(roomId).emit('game_start', {
      players: room.players,
      board: room.board,
      currentTurn: room.currentTurn,
    });
  });

  socket.on('drop_piece', ({ col }) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.gameOver) return;
    if (room.currentTurn !== socket.id) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const row = dropPiece(room.board, col, player.color);
    if (row === -1) return;

    if (checkWin(room.board, row, col, player.color)) {
      room.gameOver = true;
      io.to(roomId).emit('game_update', { board: room.board, currentTurn: null });
      io.to(roomId).emit('game_over', { winner: player.name, color: player.color });
      return;
    }

    if (isDraw(room.board)) {
      room.gameOver = true;
      io.to(roomId).emit('game_update', { board: room.board, currentTurn: null });
      io.to(roomId).emit('game_over', { winner: null });
      return;
    }

    const next = room.players.find(p => p.id !== socket.id);
    room.currentTurn = next.id;
    io.to(roomId).emit('game_update', { board: room.board, currentTurn: room.currentTurn });
  });

  socket.on('restart_game', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;
    room.board = createBoard();
    room.gameOver = false;
    room.currentTurn = room.players[0].id;
    io.to(roomId).emit('game_start', {
      players: room.players,
      board: room.board,
      currentTurn: room.currentTurn,
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) {
      delete rooms[roomId];
    } else {
      io.to(roomId).emit('opponent_left');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));
