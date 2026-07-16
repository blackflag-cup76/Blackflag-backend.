const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});

router.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const { passcode } = req.body || {};
    if (!passcode) return res.status(400).json({ error: 'Passcode required.' });

    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash) return res.status(500).json({ error: 'Admin login is not configured on the server.' });

    const ok = await bcrypt.compare(passcode, hash);
    if (!ok) return res.status(401).json({ error: 'Wrong passcode.' });

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.cookie('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

router.get('/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, username, created_at FROM users ORDER BY created_at DESC').all());
});

module.exports = router;
