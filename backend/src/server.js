
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const db = require('./config/db');

const app = express();
const port = Number(process.env.PORT || 3000);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET doit contenir au moins 32 caractères.');
  process.exit(1);
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error('Origine CORS non autorisée.'));
  },
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, service: 'fastfood-one-api', database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, service: 'fastfood-one-api', database: 'unavailable' });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d', immutable: true }));
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));

app.use((req, res) => res.status(404).json({ error: 'Route introuvable.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === 'Origine CORS non autorisée.') return res.status(403).json({ error: 'Origine non autorisée.' });
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erreur serveur. Réessayez plus tard.' });
});

app.listen(port, () => console.log(`FastFood One API écoute sur le port ${port}`));
