
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d', issuer: 'fastfood-one' }
  );
}

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Nom invalide.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
    if (phone.length < 6 || phone.length > 40) return res.status(400).json({ error: 'Téléphone invalide.' });
    if (password.length < 10 || password.length > 72) return res.status(400).json({ error: 'Le mot de passe doit contenir 10 à 72 caractères.' });
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      'INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,?)',
      [name, email, phone, hash, 'customer']
    );
    const user = { id: result.insertId, name, email, phone, role: 'customer' };
    return res.status(201).json({ token: makeToken(user), user });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const [rows] = await db.execute(
      'SELECT id,name,email,phone,password_hash,role,is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }
    const safeUser = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
    return res.json({ token: makeToken(safeUser), user: safeUser });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT id,name,email,phone,role FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    return res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

router.post('/fcm-token', authenticate, async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    if (!token || token.length > 4096) return res.status(400).json({ error: 'Token FCM invalide.' });
    await db.execute('UPDATE users SET fcm_token = ? WHERE id = ?', [token, req.user.id]);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/fcm-token', authenticate, async (req, res, next) => {
  try {
    await db.execute('UPDATE users SET fcm_token = NULL WHERE id = ?', [req.user.id]);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
