/* ============================================
   TIC TAC TOE — Game Logic (Local + Online)
   ============================================ */

(() => {
  'use strict';

  // ---- DOM Elements ----
  const $ = id => document.getElementById(id);
  const setupScreen = $('setup-screen');
  const lobbyScreen = $('lobby-screen');
  const waitingScreen = $('waiting-screen');
  const gameScreen = $('game-screen');
  const resultOverlay = $('result-overlay');
  const disconnectOverlay = $('disconnect-overlay');
  const board = $('board');
  const cells = document.querySelectorAll('.cell');
  const p1Input = $('p1-name');
  const p2Input = $('p2-name');
  const startBtn = $('start-btn');
  const onlineBtn = $('online-btn');
  const resetBtn = $('reset-btn');
  const menuBtn = $('menu-btn');
  const playAgainBtn = $('play-again-btn');
  const backMenuBtn = $('back-menu-btn');
  const turnIndicator = $('turn-indicator');
  const turnText = $('turn-text');
  const p1Card = $('p1-card');
  const p2Card = $('p2-card');
  const p1Display = $('p1-display');
  const p2Display = $('p2-display');
  const p1ScoreEl = $('p1-score');
  const p2ScoreEl = $('p2-score');
  const roundNum = $('round-num');
  const resultIcon = $('result-icon');
  const resultText = $('result-text');
  const resultSub = $('result-sub');
  const strikeLine = $('strike');

  // Lobby elements
  const onlineNameInput = $('online-name');
  const createRoomBtn = $('create-room-btn');
  const joinRoomBtn = $('join-room-btn');
  const roomCodeInput = $('room-code-input');
  const lobbyError = $('lobby-error');
  const lobbyBackBtn = $('lobby-back-btn');
  const roomCodeText = $('room-code-text');
  const copyCodeBtn = $('copy-code-btn');
  const cancelWaitBtn = $('cancel-wait-btn');
  const disconnectMenuBtn = $('disconnect-menu-btn');

  // ---- Win Patterns ----
  const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diags
  ];

  // Line coordinates for strike-through
  const LINE_COORDS = {
    0: { x1: 16.6, y1: 8,    x2: 16.6, y2: 92  },
    1: { x1: 50,   y1: 8,    x2: 50,   y2: 92  },
    2: { x1: 83.4, y1: 8,    x2: 83.4, y2: 92  },
    3: { x1: 8,    y1: 16.6, x2: 92,   y2: 16.6 },
    4: { x1: 8,    y1: 50,   x2: 92,   y2: 50   },
    5: { x1: 8,    y1: 83.4, x2: 92,   y2: 83.4 },
    6: { x1: 8,    y1: 8,    x2: 92,   y2: 92   },
    7: { x1: 92,   y1: 8,    x2: 8,    y2: 92   },
  };

  const PATTERN_TO_LINE = [3, 4, 5, 0, 1, 2, 6, 7];

  // ---- Game State ----
  let state = {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    p1Name: 'Player 1',
    p2Name: 'Player 2',
    p1Score: 0,
    p2Score: 0,
    round: 1,
    gameOver: false,
    mode: 'local', // 'local' or 'online'
    mySymbol: null, // 'X' or 'O' (online only)
  };

  let socket = null;

  // ---- Sound Effects (Web Audio) ----
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx;

  function initAudio() {
    if (!audioCtx) audioCtx = new AudioCtx();
  }

  function playTone(freq, duration, type = 'sine', vol = 0.08) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function sfxPlace() {
    playTone(520, 0.1, 'sine', 0.06);
    playTone(780, 0.08, 'sine', 0.04);
  }

  function sfxWin() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, 'triangle', 0.07), i * 100);
    });
  }

  function sfxDraw() {
    playTone(330, 0.3, 'sawtooth', 0.04);
    setTimeout(() => playTone(294, 0.4, 'sawtooth', 0.03), 150);
  }

  // ---- Screen Transitions ----
  function showScreen(screen) {
    [setupScreen, lobbyScreen, waitingScreen, gameScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  function showResult(icon, text, sub) {
    resultIcon.textContent = icon;
    resultText.textContent = text;
    resultSub.textContent = sub;
    resultOverlay.classList.add('visible');
  }

  function hideResult() {
    resultOverlay.classList.remove('visible');
  }

  function hideDisconnect() {
    disconnectOverlay.classList.remove('visible');
  }

  // ---- Game Logic ----
  function resetBoard() {
    state.board = Array(9).fill(null);
    state.currentPlayer = 'X';
    state.gameOver = false;

    cells.forEach(cell => {
      cell.textContent = '';
      cell.className = 'cell';
    });

    strikeLine.classList.remove('animate');
    strikeLine.setAttribute('x1', 0);
    strikeLine.setAttribute('y1', 0);
    strikeLine.setAttribute('x2', 0);
    strikeLine.setAttribute('y2', 0);

    updateTurnUI();
    updateBoardInteractivity();
  }

  function updateTurnUI() {
    const name = state.currentPlayer === 'X' ? state.p1Name : state.p2Name;

    if (state.mode === 'online') {
      const isMyTurn = state.currentPlayer === state.mySymbol;
      turnText.textContent = isMyTurn ? 'Your turn' : `${name}'s turn`;
    } else {
      turnText.textContent = `${name}'s turn`;
    }

    turnIndicator.className = 'turn-indicator ' + (state.currentPlayer === 'X' ? 'x-turn' : 'o-turn');
    p1Card.classList.toggle('active-turn', state.currentPlayer === 'X');
    p2Card.classList.toggle('active-turn', state.currentPlayer === 'O');
  }

  function updateBoardInteractivity() {
    if (state.mode === 'online' && !state.gameOver) {
      const isMyTurn = state.currentPlayer === state.mySymbol;
      board.classList.toggle('disabled', !isMyTurn);
    } else {
      board.classList.remove('disabled');
    }
  }

  function updateScoreUI() {
    p1ScoreEl.textContent = state.p1Score;
    p2ScoreEl.textContent = state.p2Score;
    roundNum.textContent = state.round;
  }

  function checkWin() {
    for (let i = 0; i < WIN_PATTERNS.length; i++) {
      const [a, b, c] = WIN_PATTERNS[i];
      if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) {
        return { winner: state.board[a], pattern: WIN_PATTERNS[i], lineIdx: PATTERN_TO_LINE[i] };
      }
    }
    return null;
  }

  function isDraw() {
    return state.board.every(cell => cell !== null);
  }

  function drawStrikeLine(lineIdx) {
    const coords = LINE_COORDS[lineIdx];
    const pct = (v) => (v / 100) * 300;
    strikeLine.setAttribute('x1', pct(coords.x1));
    strikeLine.setAttribute('y1', pct(coords.y1));
    strikeLine.setAttribute('x2', pct(coords.x2));
    strikeLine.setAttribute('y2', pct(coords.y2));

    strikeLine.classList.remove('animate');
    void strikeLine.offsetWidth;
    strikeLine.classList.add('animate');
  }

  function showWinResult(winnerSymbol) {
    const winnerName = winnerSymbol === 'X' ? state.p1Name : state.p2Name;
    const emojis = ['🏆', '🔥', '⚡', '🎯', '💥', '👑'];
    const subs = ['Absolute domination.', 'What a play!', 'No contest.', 'Clinical finish.', 'Unstoppable.', 'Flawless.'];

    setTimeout(() => {
      showResult(
        emojis[Math.floor(Math.random() * emojis.length)],
        `${winnerName} Wins!`,
        subs[Math.floor(Math.random() * subs.length)]
      );
    }, 700);
  }

  function showDrawResult() {
    setTimeout(() => {
      showResult('🤝', "It's a Draw!", 'Evenly matched.');
    }, 400);
  }

  // ---- Local Mode: Cell Click ----
  function handleCellClick(e) {
    if (state.gameOver) return;

    const cell = e.currentTarget;
    const idx = parseInt(cell.dataset.index);
    if (state.board[idx]) return;

    if (state.mode === 'online') {
      // Online: only allow if it's my turn
      if (state.currentPlayer !== state.mySymbol) return;
      socket.emit('make-move', idx);
      return;
    }

    // Local mode
    initAudio();
    sfxPlace();
    placeMove(idx);

    const result = checkWin();
    if (result) {
      state.gameOver = true;
      result.pattern.forEach(i => cells[i].classList.add('win-cell'));
      drawStrikeLine(result.lineIdx);

      if (result.winner === 'X') state.p1Score++;
      else state.p2Score++;
      updateScoreUI();
      sfxWin();
      showWinResult(result.winner);
      return;
    }

    if (isDraw()) {
      state.gameOver = true;
      sfxDraw();
      showDrawResult();
      return;
    }

    state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
    updateTurnUI();
  }

  function placeMove(idx) {
    const symbol = state.currentPlayer;
    state.board[idx] = symbol;
    const cell = cells[idx];
    cell.textContent = symbol;
    cell.classList.add('taken', symbol.toLowerCase());
  }

  // ---- Local Game Start ----
  function startLocalGame() {
    initAudio();
    state.mode = 'local';
    state.mySymbol = null;
    state.p1Name = p1Input.value.trim() || 'Player 1';
    state.p2Name = p2Input.value.trim() || 'Player 2';
    state.p1Score = 0;
    state.p2Score = 0;
    state.round = 1;

    p1Display.textContent = state.p1Name;
    p2Display.textContent = state.p2Name;
    updateScoreUI();
    resetBoard();
    showScreen(gameScreen);
  }

  function newRound() {
    if (state.mode === 'online') {
      // Send play-again vote to server
      socket.emit('play-again');
      playAgainBtn.textContent = 'Waiting for opponent...';
      playAgainBtn.disabled = true;
      return;
    }
    hideResult();
    state.round++;
    resetBoard();
    updateScoreUI();
  }

  function goToMenu() {
    hideResult();
    hideDisconnect();
    if (state.mode === 'online' && socket) {
      socket.emit('leave-room');
    }
    state.mode = 'local';
    showScreen(setupScreen);
  }

  // ============================================
  //  ONLINE MODE — Socket.IO
  // ============================================

  function connectSocket() {
    if (socket) return;
    socket = io();

    socket.on('room-created', ({ code }) => {
      roomCodeText.textContent = code;
      showScreen(waitingScreen);
    });

    socket.on('assigned-symbol', (symbol) => {
      state.mySymbol = symbol;
    });

    socket.on('game-start', ({ p1Name, p2Name, board: brd, currentPlayer, scores, round }) => {
      state.mode = 'online';
      state.p1Name = p1Name;
      state.p2Name = p2Name;
      state.board = brd;
      state.currentPlayer = currentPlayer;
      state.p1Score = scores.X;
      state.p2Score = scores.O;
      state.round = round;
      state.gameOver = false;

      p1Display.textContent = state.p1Name;
      p2Display.textContent = state.p2Name;
      updateScoreUI();
      resetBoard();
      showScreen(gameScreen);
    });

    socket.on('move-made', ({ index, symbol, winner, draw, scores }) => {
      initAudio();
      sfxPlace();

      state.board[index] = symbol;
      const cell = cells[index];
      cell.textContent = symbol;
      cell.classList.add('taken', symbol.toLowerCase());

      if (winner) {
        state.gameOver = true;
        state.p1Score = scores.X;
        state.p2Score = scores.O;
        updateScoreUI();

        // Find which pattern won to draw the line
        const result = checkWin();
        if (result) {
          result.pattern.forEach(i => cells[i].classList.add('win-cell'));
          drawStrikeLine(result.lineIdx);
        }

        sfxWin();
        showWinResult(winner);
        board.classList.remove('disabled');
      } else if (draw) {
        state.gameOver = true;
        sfxDraw();
        showDrawResult();
        board.classList.remove('disabled');
      } else {
        state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
        updateTurnUI();
        updateBoardInteractivity();
      }
    });

    socket.on('new-round', ({ board: brd, currentPlayer, round, scores }) => {
      hideResult();
      state.board = brd;
      state.currentPlayer = currentPlayer;
      state.round = round;
      state.p1Score = scores.X;
      state.p2Score = scores.O;
      state.gameOver = false;

      playAgainBtn.textContent = 'Play Again';
      playAgainBtn.disabled = false;

      resetBoard();
      updateScoreUI();
    });

    socket.on('opponent-wants-rematch', () => {
      // Update the play again button to show opponent wants rematch
      resultSub.textContent = 'Opponent wants a rematch!';
    });

    socket.on('opponent-disconnected', () => {
      hideResult();
      disconnectOverlay.classList.add('visible');
    });

    socket.on('join-error', (msg) => {
      lobbyError.textContent = msg;
    });
  }

  // ---- Lobby Actions ----
  onlineBtn.addEventListener('click', () => {
    initAudio();
    connectSocket();
    lobbyError.textContent = '';
    showScreen(lobbyScreen);
  });

  createRoomBtn.addEventListener('click', () => {
    const name = onlineNameInput.value.trim() || 'Player 1';
    socket.emit('create-room', name);
  });

  joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (!code) {
      lobbyError.textContent = 'Please enter a room code.';
      return;
    }
    lobbyError.textContent = '';
    const name = onlineNameInput.value.trim() || 'Player 2';
    socket.emit('join-room', { code, playerName: name });
  });

  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoomBtn.click();
  });

  copyCodeBtn.addEventListener('click', () => {
    const code = roomCodeText.textContent;
    navigator.clipboard.writeText(code).then(() => {
      copyCodeBtn.title = 'Copied!';
      setTimeout(() => { copyCodeBtn.title = 'Copy code'; }, 2000);
    });
  });

  lobbyBackBtn.addEventListener('click', () => {
    showScreen(setupScreen);
  });

  cancelWaitBtn.addEventListener('click', () => {
    if (socket) socket.emit('leave-room');
    showScreen(lobbyScreen);
  });

  disconnectMenuBtn.addEventListener('click', goToMenu);

  // ---- Event Listeners ----
  cells.forEach(cell => cell.addEventListener('click', handleCellClick));
  startBtn.addEventListener('click', startLocalGame);
  resetBtn.addEventListener('click', () => {
    if (state.mode === 'online') return; // Disable in online mode
    resetBoard();
    updateScoreUI();
  });
  menuBtn.addEventListener('click', goToMenu);
  playAgainBtn.addEventListener('click', newRound);
  backMenuBtn.addEventListener('click', goToMenu);

  // Enter key on inputs
  [p1Input, p2Input].forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') startLocalGame();
    });
  });

  // ---- Particles Background ----
  function initParticles() {
    const canvas = $('particles');
    const ctx = canvas.getContext('2d');
    let w, h;
    const particles = [];
    const PARTICLE_COUNT = 50;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.5,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        color: Math.random() > 0.5
          ? `rgba(255,107,107,${Math.random() * 0.3 + 0.1})`
          : `rgba(78,205,196,${Math.random() * 0.3 + 0.1})`
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      particles.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;

        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });

      // Draw faint connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(107,113,148,${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(draw);
    }

    draw();
  }

  initParticles();
})();
