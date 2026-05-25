const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const DEFAULT_GROUP_COUNT = 4;
let state = { groupCount: DEFAULT_GROUP_COUNT, scores: Array(DEFAULT_GROUP_COUNT).fill(0) };

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      group_count INTEGER NOT NULL DEFAULT 4,
      scores JSONB NOT NULL DEFAULT '[]'
    )
  `);

  const result = await pool.query('SELECT * FROM game_state WHERE id = 1');
  if (result.rows.length > 0) {
    const row = result.rows[0];
    state = { groupCount: row.group_count, scores: row.scores };
  } else {
    await saveState();
  }
}

async function saveState() {
  await pool.query(`
    INSERT INTO game_state (id, group_count, scores)
    VALUES (1, $1, $2)
    ON CONFLICT (id) DO UPDATE SET group_count = $1, scores = $2
  `, [state.groupCount, JSON.stringify(state.scores)]);
}

function resetScores(count) {
  state.groupCount = count;
  state.scores = Array(count).fill(0);
}

io.on('connection', (socket) => {
  socket.emit('sync', state);

  socket.on('set-groups', async (count) => {
    const allZero = state.scores.every(s => s === 0);
    if (!allZero) {
      socket.emit('error', '目前有組別已有分數，請先重置才能更改組別數。');
      return;
    }
    const n = Math.max(1, Math.min(20, parseInt(count) || DEFAULT_GROUP_COUNT));
    state.groupCount = n;
    state.scores = Array(n).fill(0);
    await saveState();
    io.emit('sync', state);
  });

  socket.on('reset', async (password) => {
    if (password !== '0000') {
      socket.emit('error', '密碼錯誤');
      return;
    }
    state.groupCount = DEFAULT_GROUP_COUNT;
    state.scores = Array(DEFAULT_GROUP_COUNT).fill(0);
    await saveState();
    io.emit('sync', state);
  });

  socket.on('add-score', async ({ index, delta }) => {
    if (index < 0 || index >= state.groupCount) return;
    state.scores[index] += delta;
    await saveState();
    io.emit('sync', state);
  });

  socket.on('set-score', async ({ index, value }) => {
    if (index < 0 || index >= state.groupCount) return;
    const n = parseInt(value);
    if (isNaN(n)) return;
    state.scores[index] = n;
    await saveState();
    io.emit('sync', state);
  });
});

const PORT = process.env.PORT || 3001;

initDB()
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });
