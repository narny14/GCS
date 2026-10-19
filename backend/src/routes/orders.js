
const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendRestaurantNewOrder, sendOrderReady } = require('../services/notifications');

const router = express.Router();
const transitions = {
  pending: new Set(['accepted', 'cancelled']),
  accepted: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready']),
  ready: new Set(['picked_up']),
  picked_up: new Set(),
  cancelled: new Set()
};

router.post('/', authenticate, async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const items = req.body.items;
    const customerName = String(req.body.customer_name || '').trim();
    const customerPhone = String(req.body.customer_phone || '').trim();
    const notes = String(req.body.notes || '').trim();
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) return res.status(400).json({ error: 'Le panier est vide ou trop volumineux.' });
    if (customerName.length < 2 || customerName.length > 120 || customerPhone.length < 6 || customerPhone.length > 40) {
      return res.status(400).json({ error: 'Nom ou téléphone invalide.' });
    }
    if (notes.length > 500) return res.status(400).json({ error: 'Note trop longue.' });

    const quantities = new Map();
    for (const item of items) {
      const id = Number(item.product_id);
      const qty = Number(item.quantity);
      if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(qty) || qty < 1 || qty > 20) {
        return res.status(400).json({ error: 'Produit ou quantité invalide.' });
      }
      quantities.set(id, (quantities.get(id) || 0) + qty);
    }
    if ([...quantities.values()].some(q => q > 20)) return res.status(400).json({ error: 'Quantité maximale dépassée.' });

    await conn.beginTransaction();
    const ids = [...quantities.keys()];
    const placeholders = ids.map(() => '?').join(',');
    const [products] = await conn.query(
      `SELECT id,name,price FROM products WHERE is_available = 1 AND id IN (${placeholders}) FOR UPDATE`,
      ids
    );
    if (products.length !== ids.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Un ou plusieurs produits ne sont plus disponibles.' });
    }

    let total = 0;
    const lineItems = products.map(p => {
      const quantity = quantities.get(Number(p.id));
      const unitPrice = Number(p.price);
      const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
      total = Math.round((total + lineTotal) * 100) / 100;
      return { product_id: p.id, product_name: p.name, unit_price: unitPrice, quantity, line_total: lineTotal };
    });

    const orderNumber = `FF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [result] = await conn.execute(
      `INSERT INTO orders (order_number,user_id,status,payment_method,payment_status,customer_name,customer_phone,notes,subtotal,total)
       VALUES (?,?, 'pending','cash_pickup','unpaid',?,?,?,?,?)`,
      [orderNumber, req.user.id, customerName, customerPhone, notes || null, total, total]
    );
    for (const item of lineItems) {
      await conn.execute(
        'INSERT INTO order_items (order_id,product_id,product_name,unit_price,quantity,line_total) VALUES (?,?,?,?,?,?)',
        [result.insertId, item.product_id, item.product_name, item.unit_price, item.quantity, item.line_total]
      );
    }
    await conn.commit();

    const order = { id: result.insertId, order_number: orderNumber, customer_name: customerName, total };
    // Push is best-effort: a push provider outage must not undo a saved order.
    sendRestaurantNewOrder(order).catch(() => {});
    return res.status(201).json({ order: { ...order, status: 'pending', payment_method: 'cash_pickup', items: lineItems } });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    next(err);
  } finally { conn.release(); }
});

router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const [orders] = await db.execute(
      'SELECT id,order_number,status,payment_method,payment_status,subtotal,total,created_at,updated_at,ready_at,picked_up_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    if (!orders.length) return res.json({ orders: [] });
    const ids = orders.map(o => o.id);
    const [items] = await db.query(
      `SELECT order_id,product_name,unit_price,quantity,line_total FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
      ids
    );
    const byOrder = new Map();
    for (const item of items) {
      if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
      byOrder.get(item.order_id).push(item);
    }
    res.json({ orders: orders.map(o => ({ ...o, items: byOrder.get(o.id) || [] })) });
  } catch (err) { next(err); }
});

router.get('/admin/all', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : '';
    const valid = ['pending','accepted','preparing','ready','picked_up','cancelled'];
    let sql = 'SELECT o.*, u.email AS customer_email FROM orders o JOIN users u ON u.id=o.user_id';
    const params = [];
    if (valid.includes(status)) { sql += ' WHERE o.status = ?'; params.push(status); }
    sql += ' ORDER BY FIELD(o.status, "pending","accepted","preparing","ready","picked_up","cancelled"), o.created_at DESC LIMIT 200';
    const [orders] = await db.execute(sql, params);
    if (!orders.length) return res.json({ orders: [] });
    const ids = orders.map(o => o.id);
    const [items] = await db.query(
      `SELECT order_id,product_name,unit_price,quantity,line_total FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
      ids
    );
    const byOrder = new Map();
    for (const item of items) {
      if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
      byOrder.get(item.order_id).push(item);
    }
    res.json({ orders: orders.map(o => ({ ...o, items: byOrder.get(o.id) || [] })) });
  } catch (err) { next(err); }
});

router.patch('/:id/status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const nextStatus = String(req.body.status || '');
    if (!Object.prototype.hasOwnProperty.call(transitions, nextStatus)) return res.status(400).json({ error: 'Statut invalide.' });
    const [rows] = await db.execute(
      `SELECT o.*, u.fcm_token FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id = ? LIMIT 1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
    if (!transitions[order.status].has(nextStatus)) {
      return res.status(409).json({ error: `Transition interdite : ${order.status} -> ${nextStatus}.` });
    }
    const extras = nextStatus === 'ready' ? ', ready_at = NOW()' : nextStatus === 'picked_up' ? ', picked_up_at = NOW(), payment_status = "paid"' : '';
    await db.execute(`UPDATE orders SET status = ?${extras} WHERE id = ? AND status = ?`, [nextStatus, order.id, order.status]);
    if (nextStatus === 'ready') sendOrderReady(order.fcm_token, order).catch(() => {});
    res.json({ ok: true, order_id: order.id, status: nextStatus });
  } catch (err) { next(err); }
});

module.exports = router;
