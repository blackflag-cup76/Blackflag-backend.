const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'proofs');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || '.jpg';
    const random = crypto.randomBytes(8).toString('hex');
    cb(null, `u${req.user.id}_${Date.now()}_${random}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) return cb(new Error('Only PNG, JPEG, or WEBP images are allowed.'));
    cb(null, true);
  }
});

function uploadSingle(req, res, next) {
  upload.single('proof')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

router.post('/', requireAuth, uploadSingle, (req, res, next) => {
  try {
    const { tournament_id, in_game_name, in_game_id, team_members, amount_paid } = req.body || {};
    if (!tournament_id || !in_game_name || !in_game_id) {
      return res.status(400).json({ error: 'tournament_id, in_game_name, and in_game_id are required.' });
    }

    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournament_id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

    if (tournament.slots_filled >= tournament.slots_total) {
      return res.status(409).json({ error: 'This tournament is full.' });
    }

    const existing = db.prepare('SELECT id FROM registrations WHERE user_id = ? AND tournament_id = ?')
      .get(req.user.id, tournament_id);
    if (existing) return res.status(409).json({ error: 'You are already registered for this tournament.' });

    const proofPath = req.file ? `/uploads/proofs/${req.file.filename}` : null;

    const insertReg = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO registrations
          (user_id, tournament_id, in_game_name, in_game_id, team_members, amount_paid, payment_proof_path, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        req.user.id, tournament_id, in_game_name, in_game_id,
        team_members || null, Number(amount_paid) || tournament.entry_fee, proofPath
      );
      db.prepare('UPDATE tournaments SET slots_filled = slots_filled + 1 WHERE id = ?').run(tournament_id);
      return info.lastInsertRowid;
    });

    const id = insertReg();
    res.status(201).json({ id, status: 'pending' });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, t.title, t.game, t.start_time
    FROM registrations r
    JOIN tournaments t ON t.id = r.tournament_id
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// Admin: view all registrations, optionally filtered by status
router.get('/', requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT r.*, u.username, t.title, t.game
    FROM registrations r
    JOIN users u ON u.id = r.user_id
    JOIN tournaments t ON t.id = r.tournament_id
  `;
  const params = [];
  if (status) { sql += ' WHERE r.status = ?'; params.push(status); }
  sql += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// Admin: approve or reject a registration after checking the payment proof
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, confirmed, or rejected.' });
  }
  const result = db.prepare('UPDATE registrations SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Registration not found.' });
  res.json({ ok: true });
});

module.exports = router;
