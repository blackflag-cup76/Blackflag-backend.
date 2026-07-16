const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const clean = username.trim();

    const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(clean);
    if (existing) return res.status(409).json({ error: 'That username is already taken.' });

    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(clean, hash);

    const token = jwt.sign({ id: info.lastInsertRowid, username: clean }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, cookieOpts());
    res.status(201).json({ username: clean });
  } catch (e) { next(e); }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
    // Always run bcrypt.compare even on a missing user, against a dummy hash,
    // so response timing doesn't reveal whether the username exists.
    const hashToCheck = user ? user.password_hash : '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7fh//5c4nz/6.uW.6iP.j9U0YRA0xoK';
    const ok = await bcrypt.compare(password, hashToCheck);

    if (!user || !ok) return res.status(401).json({ error: 'Incorrect username or password.' });

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, cookieOpts());
    res.json({ username: user.username });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

module.exports = router;
