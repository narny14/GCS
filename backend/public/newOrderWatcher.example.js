// Exemple d'alerte Web par polling. Adaptez api() et la forme de réponse à votre app.js.
// Le push navigateur en arrière-plan demande Firebase Web SDK, service worker et clé VAPID.
export function startNewOrderWatcher({api,onNewOrder,intervalMs=10000}){
 let stopped=false,timer=null,known=new Set(),initialized=false;
 async function poll(){if(stopped)return;try{
  const result=await api('/api/orders/admin/all');const orders=Array.isArray(result)?result:(result.orders||[]);const current=new Set(orders.map(o=>String(o.id)));
  if(initialized)for(const order of orders)if(!known.has(String(order.id)))onNewOrder(order);
  known=current;initialized=true;
 }catch(e){console.error('[FastFood One] Rafraîchissement commandes impossible:',e.message);}finally{if(!stopped)timer=setTimeout(poll,intervalMs);}}
 poll();return()=>{stopped=true;if(timer)clearTimeout(timer);};
}
export function requestOrderNotificationPermission(){if(!('Notification'in window))return Promise.resolve(false);return Notification.requestPermission().then(p=>p==='granted');}
export function showNewOrderBrowserNotification(order){if(!('Notification'in window)||Notification.permission!=='granted')return;const n=order.order_number||order.orderNumber||order.id;new Notification('Nouvelle commande FastFood One',{body:`Commande ${n} reçue.`,tag:`order-${order.id}`});}
