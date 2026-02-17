const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname), { index: 'index.html' }));

// Explicit root route fallback
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Room storage: roomCode -> { players: [socketId, socketId], board, currentPlayer, scores, round }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function checkWin(board) {
  for (const [a, b, c] of WIN_PATTERNS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isDraw(board) {
  return board.every(cell => cell !== null);
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('create-room', (playerName) => {
    const code = generateRoomCode();
    const room = {
      code,
      players: [{ id: socket.id, name: playerName || 'Player 1', symbol: 'X' }],
      board: Array(9).fill(null),
      currentPlayer: 'X',
      scores: { X: 0, O: 0 },
      round: 1,
      playAgainVotes: new Set(),
    };
    rooms.set(code, room);
    socket.join(code);
    currentRoom = code;
    socket.emit('room-created', { code, symbol: 'X' });
  });

  socket.on('join-room', ({ code, playerName }) => {
    const roomCode = code.toUpperCase().trim();
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('join-error', 'Room not found. Check the code and try again.');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('join-error', 'Room is full.');
      return;
    }

    room.players.push({ id: socket.id, name: playerName || 'Player 2', symbol: 'O' });
    socket.join(roomCode);
    currentRoom = roomCode;

    // Notify both players the game is starting
    const p1 = room.players[0];
    const p2 = room.players[1];

    io.to(roomCode).emit('game-start', {
      p1Name: p1.name,
      p2Name: p2.name,
      board: room.board,
      currentPlayer: room.currentPlayer,
      scores: room.scores,
      round: room.round,
    });

    // Tell joiner their symbol
    socket.emit('assigned-symbol', 'O');
    io.to(p1.id).emit('assigned-symbol', 'X');
  });

  socket.on('make-move', (index) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.players.length < 2) return;

    // Find which player this socket is
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Validate it's this player's turn
    if (player.symbol !== room.currentPlayer) return;

    // Validate move
    if (index < 0 || index > 8 || room.board[index] !== null) return;

    // Apply move
    room.board[index] = player.symbol;

    const winner = checkWin(room.board);
    const draw = !winner && isDraw(room.board);

    if (winner) {
      room.scores[winner]++;
    }

    // Broadcast move to both players
    io.to(currentRoom).emit('move-made', {
      index,
      symbol: player.symbol,
      board: room.board,
      winner,
      draw,
      scores: room.scores,
    });

    if (!winner && !draw) {
      room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
    }
  });

  socket.on('play-again', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.playAgainVotes.add(socket.id);

    if (room.playAgainVotes.size === 2) {
      // Both agreed — reset board
      room.board = Array(9).fill(null);
      room.currentPlayer = 'X';
      room.round++;
      room.playAgainVotes.clear();

      io.to(currentRoom).emit('new-round', {
        board: room.board,
        currentPlayer: room.currentPlayer,
        round: room.round,
        scores: room.scores,
      });
    } else {
      // Notify opponent that this player wants to play again
      socket.to(currentRoom).emit('opponent-wants-rematch');
    }
  });

  socket.on('leave-room', () => {
    leaveRoom(socket, currentRoom);
    currentRoom = null;
  });

  socket.on('disconnect', () => {
    leaveRoom(socket, currentRoom);
  });

  function leaveRoom(sock, roomCode) {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    sock.to(roomCode).emit('opponent-disconnected');
    sock.leave(roomCode);

    // Remove the player
    room.players = room.players.filter(p => p.id !== sock.id);

    // If room is empty, delete it
    if (room.players.length === 0) {
      rooms.delete(roomCode);
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log();
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║    TIC TAC TOE — MULTIPLAYER SERVER   ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  Running at: http://localhost:${PORT}    ║`);
  console.log('  ║  Press Ctrl+C to stop                ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log();
});
