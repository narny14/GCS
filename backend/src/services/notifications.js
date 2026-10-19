
const fs = require('fs');
const path = require('path');

let adminApp = null;
let firebaseMessaging = null;

function getMessaging() {
  if (firebaseMessaging) return firebaseMessaging;
  const servicePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!servicePath || !fs.existsSync(servicePath)) {
    console.warn('[FCM] Service account absent : notifications désactivées.');
    return null;
  }
  try {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(servicePath), 'utf8'));
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseMessaging = admin.messaging(adminApp);
    return firebaseMessaging;
  } catch (err) {
    console.error('[FCM] Initialisation impossible:', err.message);
    return null;
  }
}

async function sendToToken(token, notification, data = {}) {
  if (!token) return;
  const messaging = getMessaging();
  if (!messaging) return;
  try {
    await messaging.send({
      token,
      notification,
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { sound: 'default' } }
    });
  } catch (err) {
    console.error('[FCM] Envoi au client échoué:', err.message);
  }
}

async function sendRestaurantNewOrder(order) {
  const messaging = getMessaging();
  if (!messaging) return;
  const topic = process.env.FCM_RESTAURANT_TOPIC || 'restaurant-orders';
  try {
    await messaging.send({
      topic,
      notification: {
        title: `Nouvelle commande ${order.order_number}`,
        body: `${order.customer_name} — ${Number(order.total).toFixed(2)}`
      },
      data: { type: 'new_order', orderId: String(order.id), orderNumber: order.order_number },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'orders' } }
    });
  } catch (err) {
    console.error('[FCM] Notification restaurant échouée:', err.message);
  }
}

async function sendOrderReady(token, order) {
  await sendToToken(token, {
    title: 'Votre commande est prête !',
    body: `La commande ${order.order_number} vous attend au restaurant.`
  }, { type: 'order_ready', orderId: order.id, orderNumber: order.order_number });
}

module.exports = { sendRestaurantNewOrder, sendOrderReady };
