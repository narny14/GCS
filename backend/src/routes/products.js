const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[file.mimetype];
    cb(null, `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${ext || ''}`);
  }
});
const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, allowedMime.has(file.mimetype))
});
function imageUrlFor(req, filename) {
  const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/uploads/${filename}`;
}
function deleteLocalImage(url) {
  if (!url) return;
  try {
    const pathname = new URL(url, 'http://local.invalid').pathname;
    if (!pathname.startsWith('/uploads/')) return;
    const filename = path.basename(pathname);
    const target = path.join(uploadDir, filename);
    if (target.startsWith(uploadDir + path.sep)) fs.unlink(target, () => {});
  } catch {}
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT id,name,description,image_url,price,category,is_available FROM products WHERE is_available = 1 ORDER BY sort_order,id'
    );
    res.json({ products: rows });
  } catch (err) { next(err); }
});

router.get('/admin/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT * FROM products ORDER BY sort_order,id');
    res.json({ products: rows });
  } catch (err) { next(err); }
});

router.post('/upload-image', authenticate, requireAdmin, (req, res, next) => {
  imageUpload.single('image')(req, res, err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Image trop volumineuse : maximum 5 Mo.' });
      return res.status(400).json({ error: 'Image invalide. Formats acceptés : JPG, PNG ou WEBP (5 Mo maximum).' });
    }
    if (!req.file) return res.status(400).json({ error: 'Sélectionnez une image JPG, PNG ou WEBP de 5 Mo maximum.' });
    res.status(201).json({ image_url: imageUrlFor(req, req.file.filename) });
  });
});

router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const category = String(req.body.category || 'Fast-food').trim();
    const price = Number(req.body.price);
    const imageUrl = req.body.image_url ? String(req.body.image_url).trim() : null;
    if (name.length < 2 || name.length > 150 || !Number.isFinite(price) || price <= 0 || price > 1000000) {
      return res.status(400).json({ error: 'Nom ou prix invalide.' });
    }
    if (description.length > 2000 || category.length > 80 || (imageUrl && imageUrl.length > 500)) return res.status(400).json({ error: 'Description, catégorie ou URL image trop longue.' });
    const [result] = await db.execute(
      'INSERT INTO products (name,description,image_url,price,category) VALUES (?,?,?,?,?)',
      [name, description || null, imageUrl, price, category || 'Fast-food']
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

router.patch('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT id,image_url FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Produit introuvable.' });
    const oldImageUrl = rows[0].image_url;
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const category = String(req.body.category || 'Fast-food').trim();
    const price = Number(req.body.price);
    const imageUrl = req.body.image_url ? String(req.body.image_url).trim() : null;
    if (name.length < 2 || name.length > 150 || !Number.isFinite(price) || price <= 0 || price > 1000000) return res.status(400).json({ error: 'Nom ou prix invalide.' });
    if (description.length > 2000 || category.length > 80 || (imageUrl && imageUrl.length > 500)) return res.status(400).json({ error: 'Description, catégorie ou URL image trop longue.' });
    await db.execute('UPDATE products SET name=?,description=?,image_url=?,price=?,category=? WHERE id=?', [name, description || null, imageUrl, price, category || 'Fast-food', req.params.id]);
    if (oldImageUrl && oldImageUrl !== imageUrl) deleteLocalImage(oldImageUrl);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT image_url FROM products WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Produit introuvable.' });
    const [result] = await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows) deleteLocalImage(rows[0].image_url);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.patch('/:id/availability', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const available = req.body.is_available === true || req.body.is_available === 1;
    const [result] = await db.execute('UPDATE products SET is_available = ? WHERE id = ?', [available ? 1 : 0, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Produit introuvable.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
