const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const { game } = req.query;
  let sql = 'SELECT * FROM leaderboard';
  const params = [];
  if (game) { sql += ' WHERE game = ?'; params.push(game); }
  sql += ' ORDER BY earnings DESC, wins DESC LIMIT 100';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', requireAdmin, (req, res) => {
  const { username, game, wins, kills, earnings } = req.body || {};
  if (!username || !game) return res.status(400).json({ error: 'username and game are required.' });

  const info = db.prepare(`
    INSERT INTO leaderboard (username, game, wins, kills, earnings)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, game, Number(wins) || 0, Number(kills) || 0, Number(earnings) || 0);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
