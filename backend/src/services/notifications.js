'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
let messaging = null, initialized = false;

function getMessaging() {
  if (initialized) return messaging;

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!keyPath || !keyPath.trim()) {
    console.error('[FCM DIAG] Variable FIREBASE_SERVICE_ACCOUNT_PATH absente.');
    return null;
  }

  const resolvedPath = path.resolve(keyPath.trim());

  if (!fs.existsSync(resolvedPath)) {
    console.error('[FCM DIAG] Fichier JSON introuvable au chemin configuré.');
    console.error('[FCM DIAG] Chemin absolu résolu :', resolvedPath);
    return null;
  }

  try {
    const admin = require('firebase-admin');

    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const serviceAccount = JSON.parse(raw);

    console.log('[FCM DIAG] Fichier JSON lisible : oui');
    console.log(
      '[FCM DIAG] Project ID présent :',
      Boolean(serviceAccount.project_id)
    );
    console.log(
      '[FCM DIAG] Client email présent :',
      Boolean(serviceAccount.client_email)
    );
    console.log(
      '[FCM DIAG] Clé privée présente :',
      Boolean(serviceAccount.private_key)
    );
    console.log(
      '[FCM DIAG] Project ID correspond à la variable :',
      serviceAccount.project_id === process.env.FIREBASE_PROJECT_ID
    );

    const app =
      admin.apps.length > 0
        ? admin.app()
        : admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });

    messaging = admin.messaging(app);
    initialized = true;

    console.log('[FCM DIAG] Initialisation Firebase Admin réussie.');
    return messaging;
  } catch (error) {
    console.error(
      '[FCM DIAG] Échec de l’initialisation :',
      error.code || error.name || 'ERREUR_INCONNUE',
      error.message
    );
    return null;
  }
}

const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const toStringData = obj => Object.fromEntries(Object.entries(obj || {}).filter(([,v]) => v != null).map(([k,v]) => [k,String(v)]));
async function registerDevice({
  userId,
  installationId,
  token,
  platform,
  deviceLabel,
}) {
  if (!userId || !installationId || !token) {
    throw new Error('userId, installationId et token sont obligatoires.');
  }

  const [result] = await db.execute(
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
      userId,
      installationId,
      token,
      platform || 'android',
      deviceLabel || null,
    ]
  );

  const [rows] = await db.execute(
    `SELECT id
     FROM user_devices
     WHERE user_id = ? AND installation_id = ?
     LIMIT 1`,
    [userId, installationId]
  );

  if (!rows.length) {
    throw new Error("L'appareil FCM n'a pas été enregistré en base.");
  }

  return { ok: true, deviceId: rows[0].id };
}
async function deactivateDevice({userId,installationId}) { await db.execute('UPDATE user_devices SET is_active=0 WHERE user_id=? AND installation_id=?',[userId,installationId]); return {ok:true}; }
async function createNotification({userId=null,orderId=null,recipientType='customer',type,title,body,data={}}) {
 const [r]=await db.execute(`INSERT INTO notifications(user_id,order_id,recipient_type,notification_type,title,body,data_json,delivery_status) VALUES(?,?,?,?,?,?,?,'queued')`,[userId,orderId,recipientType,type,title,body,JSON.stringify(toStringData(data))]); return r.insertId;
}
async function sendNotificationToUser({userId,orderId=null,type,title,body,data={}}) {
 const id=await createNotification({userId,orderId,type,title,body,data});
 const [devices]=await db.execute('SELECT id,fcm_token,platform FROM user_devices WHERE user_id=? AND is_active=1',[userId]);
 if (!devices.length) { await db.execute("UPDATE notifications SET delivery_status='failed',last_error=? WHERE id=?",['Aucun appareil actif enregistré.',id]); return {notificationId:id,sent:0,failed:0,reason:'no_active_devices'}; }
 const client=getMessaging();
 if (!client) { await db.execute("UPDATE notifications SET delivery_status='not_configured',failed_count=?,last_error=? WHERE id=?",[devices.length,'Firebase Admin non configuré.',id]); return {notificationId:id,sent:0,failed:devices.length,reason:'fcm_not_configured'}; }
 let sent=0,failed=0;
 for (const d of devices) {
  try {
   const providerId=await client.send({token:d.fcm_token,notification:{title,body},data:toStringData({...data,notificationId:id}),android:{priority:'high',notification:{channelId:'orders',sound:'default'}},apns:{payload:{aps:{sound:'default'}}}}); sent++;
   await db.execute("INSERT INTO notification_deliveries(notification_id,device_id,platform,token_fingerprint,delivery_status,provider_message_id) VALUES(?,?,?,?,'sent',?)",[id,d.id,d.platform,hash(d.fcm_token),providerId]);
  } catch(e) {
   failed++; const code=String(e.code||'unknown').slice(0,128), msg=String(e.message||'Échec FCM').slice(0,1000); const invalid=/registration-token-not-registered|invalid-registration-token/i.test(code);
   await db.execute('INSERT INTO notification_deliveries(notification_id,device_id,platform,token_fingerprint,delivery_status,error_code,error_message) VALUES(?,?,?,?,?,?,?)',[id,d.id,d.platform,hash(d.fcm_token),invalid?'invalid_token':'failed',code,msg]);
   if(invalid) await db.execute('UPDATE user_devices SET is_active=0 WHERE id=?',[d.id]);
   console.error(`[FCM] notification=${id}, device=${d.id}, code=${code}`);
  }
 }
 const status=sent&&failed?'partial':sent?'sent':'failed';
 await db.execute('UPDATE notifications SET delivery_status=?,sent_count=?,failed_count=?,sent_at=IF(? > 0,NOW(),NULL),last_error=? WHERE id=?',[status,sent,failed,sent,failed?`${failed} appareil(s) en échec.`:null,id]);
 return {notificationId:id,sent,failed,status};
}
const templates={
 received:o=>['order_received','Commande reçue',`Nous avons reçu la commande ${o.order_number}.`],
 accepted:o=>['order_accepted','Commande acceptée',`Le restaurant a accepté la commande ${o.order_number}.`],
 preparing:o=>['order_preparing','Préparation en cours',`Votre commande ${o.order_number} est en préparation.`],
 ready:o=>['order_ready','Votre repas est prêt !',`La commande ${o.order_number} vous attend au restaurant.`],
 unavailable:(o,m)=>['order_unavailable','Article indisponible',m||`Un article de la commande ${o.order_number} est indisponible. Contactez le restaurant.`],
 cancelled:(o,m)=>['order_cancelled','Commande annulée',m||`La commande ${o.order_number} a été annulée.`]
};
async function notifyOrderCustomer(order,event,message=null) {
 if(!templates[event]) throw new Error(`Événement inconnu: ${event}`);
 const [type,title,body]=templates[event](order,message);
 return sendNotificationToUser({userId:order.user_id,orderId:order.id,type,title,body,data:{type,orderId:order.id,orderNumber:order.order_number,status:event}});
}


async function sendOrderReady(fcmToken, order) {
  if (!order || !order.user_id) {
    throw new Error('Commande sans user_id.');
  }

  // Les appareils actifs de user_devices sont la source principale.
  return notifyOrderCustomer(order, 'ready');
}

async function sendRestaurantNewOrder(order) {
  console.warn(
    '[FCM] Notification restaurant non configurée :',
    order?.order_number || order?.id,
  );

  return {
    sent: 0,
    reason: 'restaurant_recipient_not_configured',
  };
}

module.exports = {
  registerDevice,
  deactivateDevice,
  createNotification,
  sendNotificationToUser,
  notifyOrderCustomer,
  sendOrderReady,
  sendRestaurantNewOrder,
};