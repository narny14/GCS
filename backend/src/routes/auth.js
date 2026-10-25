const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const {authenticate} = require('../middleware/auth');
const {registerDevice, deactivateDevice} = require('../services/notifications');

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    {id: user.id, email: user.email, role: user.role, name: user.name},
    process.env.JWT_SECRET,
    {expiresIn: process.env.JWT_EXPIRES_IN || '7d', issuer: 'fastfood-one'}
  );
}

// Enregistrer/actualiser le token d'un appareil déjà connecté.
router.post('/fcm-token', authenticate, async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    const installationId = String(req.body.installationId || '').trim();
    const platform = String(req.body.platform || 'unknown').trim();
    const deviceLabel = String(req.body.deviceLabel || '').trim().slice(0, 160) || null;

    if (!token || token.length > 4096) return res.status(400).json({error: 'Token FCM invalide.'});
    if (!installationId || installationId.length > 128) return res.status(400).json({error: 'Identifiant d’installation invalide.'});

    const [users] = await db.execute(
      'SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
      [req.user.id]
    );
    if (!users.length) return res.status(404).json({error: 'Compte connecté introuvable.'});

    await registerDevice({userId: req.user.id, installationId, token, platform, deviceLabel});
    return res.json({ok: true, message: 'Appareil enregistré avec succès.'});
  } catch (error) {
    next(error);
  }
});

router.delete('/fcm-token', authenticate, async (req, res, next) => {
  try {
    const installationId = String(req.body.installationId || '').trim();
    if (!installationId || installationId.length > 128) {
      return res.status(400).json({error: 'Identifiant d’installation invalide.'});
    }
    await deactivateDevice({userId: req.user.id, installationId});
    return res.json({ok: true, message: 'Appareil désactivé.'});
  } catch (error) {
    next(error);
  }
});

// Inscription : compte + token FCM dans la même requête et transaction SQL.

router.post('/register', async (req, res, next) => {
  let connection;

  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');

    const fcm =
      req.body.fcm && typeof req.body.fcm === 'object'
        ? req.body.fcm
        : {};

    const fcmToken = String(fcm.token || '').trim();
    const installationId = String(fcm.installationId || '').trim();
    const platform = String(fcm.platform || 'unknown').trim();
    const deviceLabel =
      String(fcm.deviceLabel || '').trim().slice(0, 160) || null;

    // Validation des informations du compte.
    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ error: 'Nom invalide.' });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 190
    ) {
      return res.status(400).json({
        error: 'Adresse e-mail invalide.',
      });
    }

    if (phone.length < 6 || phone.length > 40) {
      return res.status(400).json({ error: 'Téléphone invalide.' });
    }

    if (password.length < 10 || password.length > 72) {
      return res.status(400).json({
        error: 'Le mot de passe doit contenir 10 à 72 caractères.',
      });
    }

    // FCM est facultatif à l'inscription.
    // Si un token est fourni, ses informations doivent être valides.
    const hasFcmToken = fcmToken.length > 0;

    if (hasFcmToken && fcmToken.length > 4096) {
      return res.status(400).json({
        error: 'Token FCM invalide.',
      });
    }

    if (
      hasFcmToken &&
      (!installationId || installationId.length > 128)
    ) {
      return res.status(400).json({
        error: 'Identifiant d’installation absent ou invalide.',
      });
    }

    if (
      hasFcmToken &&
      !['android', 'ios', 'web', 'unknown'].includes(platform)
    ) {
      return res.status(400).json({
        error: 'Plateforme de notification invalide.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email],
    );

    if (existing.length) {
      await connection.rollback();

      return res.status(409).json({
        error: 'Cette adresse e-mail est déjà utilisée.',
      });
    }

    // Créer le compte.
    const [created] = await connection.execute(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, phone, passwordHash, 'customer'],
    );

    const user = {
      id: created.insertId,
      name,
      email,
      phone,
      role: 'customer',
    };

    let fcmRegistered = false;

    // Enregistrer l'appareil uniquement si un token valide est fourni.
    if (hasFcmToken && installationId) {
      const safePlatform = ['android', 'ios', 'web', 'unknown'].includes(
        platform,
      )
        ? platform
        : 'unknown';

      await connection.execute(
        `UPDATE user_devices
         SET is_active = 0
         WHERE fcm_token = ?
           AND NOT (user_id = ? AND installation_id = ?)`,
        [fcmToken, user.id, installationId],
      );

      await connection.execute(
        `INSERT INTO user_devices
         (user_id, installation_id, fcm_token, platform,
          device_label, is_active, last_seen_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE
           fcm_token = VALUES(fcm_token),
           platform = VALUES(platform),
           device_label = VALUES(device_label),
           is_active = 1,
           last_seen_at = NOW()`,
        [
          user.id,
          installationId,
          fcmToken,
          safePlatform,
          deviceLabel,
        ],
      );

      fcmRegistered = true;
    }

    // Compte et éventuel appareil sont validés ensemble.
    await connection.commit();

    return res.status(201).json({
      token: makeToken(user),
      user,
      fcmRegistered,
      message: fcmRegistered
        ? 'Compte créé et appareil enregistré.'
        : 'Compte créé. Enregistrement des notifications à effectuer ultérieurement.',
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('[AUTH REGISTER] Échec du rollback:', rollbackError);
      }
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Cette adresse e-mail est déjà utilisée.',
      });
    }

    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const [rows] = await db.execute(
      `SELECT id, name, email, phone, password_hash, role, is_active
       FROM users WHERE email = ? LIMIT 1`, [email]
    );
    const user = rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({error: 'Identifiants incorrects.'});
    }
    const safeUser = {id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role};
    return res.json({token: makeToken(safeUser), user: safeUser});
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, name, email, phone, role
       FROM users WHERE id = ? AND is_active = 1 LIMIT 1`, [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({error: 'Utilisateur introuvable.'});
    return res.json({user: rows[0]});
  } catch (error) {
    next(error);
  }
});

module.exports = router;
