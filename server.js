const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 狀態
let state = {
  groupCount: 4,
  scores: [0, 0, 0, 0],
};

function resetScores(count) {
  state.groupCount = count;
  state.scores = Array(count).fill(0);
}

io.on('connection', (socket) => {
  // 新連線，推送目前狀態
  socket.emit('sync', state);

  socket.on('set-groups', (count) => {
    const n = Math.max(1, Math.min(20, parseInt(count) || 4));
    resetScores(n);
    io.emit('sync', state);
  });

  socket.on('add-score', ({ index, delta }) => {
    if (index < 0 || index >= state.groupCount) return;
    state.scores[index] += delta;
    io.emit('sync', state);
  });

  socket.on('set-score', ({ index, value }) => {
    if (index < 0 || index >= state.groupCount) return;
    const n = parseInt(value);
    if (isNaN(n)) return;
    state.scores[index] = n;
    io.emit('sync', state);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
