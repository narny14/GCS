const express = require('express');
const db = require('../config/db');

const router = express.Router();

const GROUPS = ['base', 'viande', 'accompagnement', 'legumes', 'boisson', 'supplements'];

/* ---------- GET /api/meal-options ---------- */
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, group_key, name, description, price, image_url, is_available, sort_order
       FROM meal_options
       ORDER BY CASE group_key
         WHEN 'base' THEN 1
         WHEN 'viande' THEN 2
         WHEN 'accompagnement' THEN 3
         WHEN 'legumes' THEN 4
         WHEN 'boisson' THEN 5
         WHEN 'supplements' THEN 6
         ELSE 7
       END, sort_order, id`
    );

    const groups = {};
    for (const g of GROUPS) groups[g] = [];
    for (const row of rows) {
      if (groups[row.group_key]) groups[row.group_key].push(row);
    }

    res.json({ options: rows, groups });
  } catch (err) { next(err); }
});

/* ---------- POST /api/meal-options ---------- */
router.post('/', async (req, res, next) => {
  try {
    const {
      group_key,
      name,
      description = null,
      price,
      image_url = null,
      is_available = 1,
      sort_order = 0,
    } = req.body || {};

    if (!GROUPS.includes(group_key)) {
      return res.status(400).json({ error: 'Catégorie invalide.' });
    }
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Le nom est obligatoire.' });
    }
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) {
      return res.status(400).json({ error: 'Prix invalide.' });
    }
    const sort = Number.isInteger(Number(sort_order)) ? Number(sort_order) : 0;

    const [result] = await db.execute(
      `INSERT INTO meal_options
        (group_key, name, description, price, image_url, is_available, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [group_key, name.trim(), description, p, image_url, is_available ? 1 : 0, sort]
    );

    const [rows] = await db.execute(
      'SELECT id, group_key, name, description, price, image_url, is_available, sort_order FROM meal_options WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ option: rows[0] });
  } catch (err) { next(err); }
});

/* ---------- PATCH /api/meal-options/:id ---------- */
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID invalide.' });

    const allowed = ['group_key', 'name', 'description', 'price', 'image_url', 'is_available', 'sort_order'];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ à modifier.' });

    values.push(id);
    const [result] = await db.execute(
      `UPDATE meal_options SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Élément introuvable.' });

    const [rows] = await db.execute(
      'SELECT id, group_key, name, description, price, image_url, is_available, sort_order FROM meal_options WHERE id = ?',
      [id]
    );
    res.json({ option: rows[0] });
  } catch (err) { next(err); }
});

/* ---------- PATCH /api/meal-options/:id/availability ---------- */
router.patch('/:id/availability', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID invalide.' });

    const available = req.body.is_available ? 1 : 0;
    const [result] = await db.execute(
      'UPDATE meal_options SET is_available = ? WHERE id = ?',
      [available, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Élément introuvable.' });

    res.json({ ok: true, is_available: available });
  } catch (err) { next(err); }
});

/* ---------- DELETE /api/meal-options/:id ---------- */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID invalide.' });

    const [result] = await db.execute('DELETE FROM meal_options WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Élément introuvable.' });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;