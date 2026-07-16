const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const WRITABLE_FIELDS = [
  'game', 'title', 'mode', 'map', 'entry_fee', 'prize_pool',
  'start_time', 'slots_total', 'slots_filled', 'status', 'room_id', 'room_pass'
];

router.get('/', (req, res) => {
  const { game, status } = req.query;
  let sql = 'SELECT * FROM tournaments WHERE 1=1';
  const params = [];
  if (game) { sql += ' AND game = ?'; params.push(game); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY start_time ASC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tournament not found.' });
  res.json(row);
});

router.post('/', requireAdmin, (req, res) => {
  const { game, title, mode, map, entry_fee, prize_pool, start_time, slots_total, status } = req.body || {};
  if (!game || !title) return res.status(400).json({ error: 'game and title are required.' });

  const info = db.prepare(`
    INSERT INTO tournaments (game, title, mode, map, entry_fee, prize_pool, start_time, slots_total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    game, title, mode || null, map || null,
    Number(entry_fee) || 0, Number(prize_pool) || 0,
    start_time || null, Number(slots_total) || 100, status || 'live'
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch('/:id', requireAdmin, (req, res) => {
  const body = req.body || {};
  const updates = [];
  const params = [];
  for (const field of WRITABLE_FIELDS) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });

  params.push(req.params.id);
  const result = db.prepare(`UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  if (result.changes === 0) return res.status(404).json({ error: 'Tournament not found.' });
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tournament not found.' });
  res.json({ ok: true });
});

module.exports = router;
