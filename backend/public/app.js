
const $ = id => document.getElementById(id);
let token = '';
let knownOrderIds = new Set();
let refreshTimer = null;
let products = [];
let selectedImageUrl = '';
let previewObjectUrl = '';
let activePanel = 'orders';

const statusLabels = {
  pending: 'Nouvelle', accepted: 'Acceptée', preparing: 'En préparation',
  ready: 'Prête au retrait', picked_up: 'Récupérée', cancelled: 'Annulée'
};
const nextActions = {
  pending: [{status:'accepted',label:'Accepter'}],
  accepted: [{status:'preparing',label:'Démarrer préparation'}],
  preparing: [{status:'ready',label:'Commande prête'}],
  ready: [{status:'picked_up',label:'Marquer récupérée / payée'}],
  picked_up: [], cancelled: []
};

function money(value) {
  return new Intl.NumberFormat('fr-FR', {style:'currency', currency:'GBP'}).format(Number(value || 0));
}
async function api(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {...(!isFormData && options.body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(options.headers || {})};
  const response = await fetch(path, {...options, headers});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erreur HTTP ${response.status}`);
  return body;
}
function showLoggedIn() {
  $('login-panel').classList.add('hidden');
  $('app-panel').classList.remove('hidden');
  $('logout').classList.remove('hidden');
}
function showLoggedOut() {
  $('login-panel').classList.remove('hidden');
  $('app-panel').classList.add('hidden');
  $('logout').classList.add('hidden');
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-error').textContent = '';
  try {
    const data = await api('/api/auth/login', {method:'POST', body:JSON.stringify({email:$('email').value, password:$('password').value})});
    if (data.user.role !== 'admin') throw new Error('Ce compte n’est pas un compte restaurant.');
    token = data.token;
    showLoggedIn();
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
    await loadOrders();
    await loadProducts();
    refreshTimer = setInterval(() => { loadOrders().catch(showError); if (activePanel === 'products') loadProducts().catch(showError); }, 10000);
  } catch (err) { $('login-error').textContent = err.message; }
});
$('logout').addEventListener('click', () => { token = ''; showLoggedOut(); });
$('refresh').addEventListener('click', () => loadOrders().catch(showError));
function showError(err) { $('global-error').textContent = err.message || String(err); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
async function updateStatus(id, status) {
  try {
    await api(`/api/orders/${id}/status`, {method:'PATCH', body:JSON.stringify({status})});
    await loadOrders();
  } catch (err) { showError(err); }
}
function orderCard(order) {
  const items = (order.items || []).map(i => `<li>${escapeHtml(i.quantity)} × ${escapeHtml(i.product_name)} — ${money(i.line_total)}</li>`).join('');
  const actions = (nextActions[order.status] || []).map(a => `<button data-id="${order.id}" data-status="${a.status}">${a.label}</button>`).join('');
  return `<article class="order ${escapeHtml(order.status)}">
    <h3>${escapeHtml(order.order_number)}</h3>
    <div class="status">${escapeHtml(statusLabels[order.status] || order.status)}</div>
    <p><strong>${escapeHtml(order.customer_name)}</strong><br>${escapeHtml(order.customer_phone)}<br><span class="muted">${escapeHtml(order.customer_email || '')}</span></p>
    <ul class="items">${items}</ul>
    ${order.notes ? `<p><strong>Note :</strong> ${escapeHtml(order.notes)}</p>` : ''}
    <p><strong>Total : ${money(order.total)}</strong> · Espèces au retrait · ${order.payment_status === 'paid' ? 'Payée' : 'Non payée'}</p>
    <p class="muted">Créée : ${new Date(order.created_at).toLocaleString('fr-FR')}</p>
    <div class="order-footer"><span class="muted">ID ${order.id}</span><div class="actions">${actions}</div></div>
  </article>`;
}
async function loadOrders() {
  if (!token) return;
  const data = await api('/api/orders/admin/all');
  const orders = data.orders || [];
  const newIds = orders.filter(o => o.status === 'pending').map(o => String(o.id));
  const hasNew = newIds.some(id => !knownOrderIds.has(id));
  if (hasNew && knownOrderIds.size) {
    // Browser notifications require permission; sound can be blocked by browser policy.
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) { const ctx = new AudioContextClass(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = 880; gain.gain.value = 0.08; osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.25); osc.onended = () => ctx.close(); }
    } catch {}
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nouvelle commande — FastFood One', { body: `${newIds.length} commande(s) en attente. Ouvrez le tableau de bord.` });
    }
    document.title = '🔔 Nouvelle commande — FastFood One';
  } else document.title = 'FastFood One — Restaurant';
  knownOrderIds = new Set(orders.map(o => String(o.id)));
  const counts = ['pending','accepted','preparing','ready'].map(s => `<span class="pill">${statusLabels[s]} : <strong>${orders.filter(o=>o.status===s).length}</strong></span>`).join('');
  $('summary').innerHTML = counts;
  $('orders').innerHTML = orders.length ? orders.map(orderCard).join('') : '<div class="empty">Aucune commande pour le moment.</div>';
  $('orders').querySelectorAll('button[data-status]').forEach(button => button.addEventListener('click', () => updateStatus(button.dataset.id, button.dataset.status)));
  $('last-refresh').textContent = `Mis à jour à ${new Date().toLocaleTimeString('fr-FR')} · actualisation toutes les 10 secondes`;
  $('global-error').textContent = '';
}


// Gestion du menu et des images des plats.
function switchPanel(panel) {
  activePanel = panel;
  $('orders-panel').classList.toggle('hidden', panel !== 'orders');
  $('products-panel').classList.toggle('hidden', panel !== 'products');
  $('tab-orders').classList.toggle('active', panel === 'orders');
  $('tab-products').classList.toggle('active', panel === 'products');
  $('tab-orders').classList.toggle('secondary', panel !== 'orders');
  $('tab-products').classList.toggle('secondary', panel !== 'products');
  if (panel === 'products') loadProducts().catch(showError);
}
$('tab-orders').addEventListener('click', () => switchPanel('orders'));
$('tab-products').addEventListener('click', () => switchPanel('products'));
function productMessage(text, isError=false) {
  $('product-message').textContent = text;
  $('product-message').className = isError ? 'error' : 'muted';
}
function resetProductForm() {
  $('product-form').reset();
  $('product-id').value = '';
  $('product-category').value = 'Fast-food';
  $('product-form-title').textContent = 'Ajouter un plat';
  $('save-product').textContent = 'Enregistrer le plat';
  $('cancel-edit').classList.add('hidden');
  $('product-image').value = '';
  selectedImageUrl = '';
  if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = ''; }
  $('image-preview').src = '';
  $('image-preview').classList.add('hidden');
  $('image-placeholder').classList.remove('hidden');
  productMessage('');
}
$('cancel-edit').addEventListener('click', resetProductForm);
$('product-image').addEventListener('change', () => {
  const file = $('product-image').files[0];
  if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = ''; }
  if (!file) {
    $('image-preview').classList.toggle('hidden', !selectedImageUrl);
    $('image-placeholder').classList.toggle('hidden', !!selectedImageUrl);
    if (selectedImageUrl) $('image-preview').src = selectedImageUrl;
    return;
  }
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5*1024*1024) {
    $('product-image').value = '';
    productMessage('Format non accepté ou image supérieure à 5 Mo. Utilisez JPG, PNG ou WEBP.', true);
    return;
  }
  previewObjectUrl = URL.createObjectURL(file);
  $('image-preview').src = previewObjectUrl;
  $('image-preview').classList.remove('hidden');
  $('image-placeholder').classList.add('hidden');
  productMessage('Photo prête à être envoyée.');
});
async function uploadSelectedImage() {
  const file = $('product-image').files[0];
  if (!file) return selectedImageUrl || null;
  const data = new FormData(); data.append('image', file);
  const result = await api('/api/products/upload-image', {method:'POST', body:data});
  return result.image_url;
}
$('product-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!token) return;
  const button = $('save-product'); button.disabled = true;
  try {
    productMessage('Envoi de la photo et enregistrement…');
    const image_url = await uploadSelectedImage();
    const payload = {
      name: $('product-name').value.trim(),
      description: $('product-description').value.trim(),
      category: $('product-category').value.trim() || 'Fast-food',
      price: Number($('product-price').value),
      image_url
    };
    const id = $('product-id').value;
    await api(id ? `/api/products/${id}` : '/api/products', {method:id ? 'PATCH' : 'POST', body:JSON.stringify(payload)});
    resetProductForm();
    productMessage('Plat enregistré avec succès.');
    await loadProducts();
  } catch (err) { productMessage(err.message || 'Échec de l’enregistrement.', true); }
  finally { button.disabled = false; }
});
async function loadProducts() {
  if (!token) return;
  const data = await api('/api/products/admin/all');
  products = data.products || [];
  $('products-list').innerHTML = products.length ? products.map(p => `
    <article class="product-card">
      ${p.image_url ? `<img class="product-card-image" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">` : '<div class="product-card-placeholder">🍔</div>'}
      <div class="product-card-content"><div class="product-card-top"><h3>${escapeHtml(p.name)}</h3><span class="availability ${Number(p.is_available) ? 'available' : 'unavailable'}">${Number(p.is_available) ? 'Disponible' : 'Indisponible'}</span></div>
      <p class="muted">${escapeHtml(p.category || 'Fast-food')}</p><p>${escapeHtml(p.description || 'Aucune description')}</p><strong>${money(p.price)}</strong>
      <div class="product-actions"><button data-edit-product="${p.id}" type="button">Modifier</button><button data-toggle-product="${p.id}" data-available="${Number(p.is_available) ? '1':'0'}" class="secondary" type="button">${Number(p.is_available) ? 'Désactiver':'Activer'}</button><button data-delete-product="${p.id}" class="danger" type="button">Supprimer</button></div></div>
    </article>`).join('') : '<div class="empty">Aucun plat. Utilisez le formulaire ci-dessus pour ajouter le premier.</div>';
  $('products-list').querySelectorAll('[data-edit-product]').forEach(b => b.addEventListener('click', () => editProduct(b.dataset.editProduct)));
  $('products-list').querySelectorAll('[data-toggle-product]').forEach(b => b.addEventListener('click', () => toggleProduct(b.dataset.toggleProduct, b.dataset.available === '1')));
  $('products-list').querySelectorAll('[data-delete-product]').forEach(b => b.addEventListener('click', () => deleteProduct(b.dataset.deleteProduct)));
}
function editProduct(id) {
  const p = products.find(item => String(item.id) === String(id)); if (!p) return;
  $('product-id').value = p.id; $('product-name').value = p.name || ''; $('product-price').value = p.price;
  $('product-category').value = p.category || 'Fast-food'; $('product-description').value = p.description || '';
  selectedImageUrl = p.image_url || ''; $('product-image').value = '';
  $('product-form-title').textContent = `Modifier : ${p.name}`; $('save-product').textContent = 'Enregistrer les modifications'; $('cancel-edit').classList.remove('hidden');
  if (selectedImageUrl) { $('image-preview').src = selectedImageUrl; $('image-preview').classList.remove('hidden'); $('image-placeholder').classList.add('hidden'); }
  else { $('image-preview').classList.add('hidden'); $('image-placeholder').classList.remove('hidden'); }
  productMessage('Choisissez une nouvelle photo uniquement si vous souhaitez remplacer l’actuelle.');
  $('product-form-title').scrollIntoView({behavior:'smooth',block:'start'});
}
async function toggleProduct(id, currentlyAvailable) {
  try { await api(`/api/products/${id}/availability`, {method:'PATCH',body:JSON.stringify({is_available:!currentlyAvailable})}); await loadProducts(); }
  catch (err) { showError(err); }
}
async function deleteProduct(id) {
  const p = products.find(item => String(item.id) === String(id));
  if (!p || !window.confirm(`Supprimer « ${p.name} » ? Cette action est définitive.`)) return;
  try { await api(`/api/products/${id}`, {method:'DELETE'}); await loadProducts(); productMessage('Plat supprimé.'); }
  catch (err) { showError(err); }
}
