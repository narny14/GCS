'use strict';
const $ = id => document.getElementById(id);
const API_BASE_URL = 'https://gcs-byteatomeneons-com-216696.hostingersite.com';

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
  pending: [
    { status: 'accepted', label: 'Accepter' },
    { status: 'cancelled', label: 'Annuler la commande' },
  ],

  accepted: [
    { status: 'preparing', label: 'Démarrer préparation' },
    { status: 'cancelled', label: 'Annuler la commande' },
  ],

  preparing: [
    { status: 'ready', label: 'Commande prête' },
    { status: 'cancelled', label: 'Annuler la commande' },
  ],

  ready: [
    { status: 'picked_up', label: 'Marquer récupérée / payée' },
    { status: 'cancelled', label: 'Annuler la commande' },
  ],

  picked_up: [],
  cancelled: [],
};





function money(value) {
  return new Intl.NumberFormat('fr-FR', {style:'currency', currency:'GBP'}).format(Number(value || 0));
}
function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
async function api(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(!isFormData && options.body ? {'Content-Type':'application/json'} : {}),
    ...(token ? {Authorization:`Bearer ${token}`} : {}),
    ...(options.headers || {})
  };
  let response;
  try {
    response = await fetch(apiUrl(path), {...options, headers});
  } catch (error) {
    throw new Error(`Impossible de joindre l'API. Vérifie que le serveur est actif et que CORS autorise https://gcs.byteatomeneons.com.`);
  }
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {error:(await response.text().catch(() => '')).slice(0,300)};
  if (!response.ok) {
    const error = new Error(body.error || body.message || `Erreur HTTP ${response.status}`);
    error.status = response.status;
    error.url = apiUrl(path);
    throw error;
  }
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
function showError(err) {
  $('global-error').textContent = `${err.message || String(err)}${err.url ? ` — ${err.url}` : ''}`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[ch]);
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-error').textContent = 'Connexion en cours…';
  try {
    const data = await api('/api/auth/login', {
      method:'POST',
      body:JSON.stringify({email:$('email').value.trim(), password:$('password').value})
    });
    if (!data.user || data.user.role !== 'admin') throw new Error('Ce compte n’a pas le rôle administrateur/restaurant attendu.');
    if (!data.token) throw new Error('Aucun jeton reçu du serveur.');
    token = data.token;
    $('login-error').textContent = '';
    showLoggedIn();
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    try { await loadOrders(); } catch (err) { showError(err); }
    try { await loadProducts(); } catch (err) { showError(err); }

     // NOUVEAU : charger les éléments de composition des repas
    try {
      await loadMealOptions();
    } catch (err) {
      showError(err);
    }
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      loadOrders().catch(showError);
      if (activePanel === 'products') loadProducts().catch(showError);
      if (activePanel === 'meals') {
  loadMealOptions().catch(showError);
}
    }, 10000);
  } catch (err) {
    $('login-error').textContent = `${err.message || 'Échec de connexion'}${err.url ? ` — ${err.url}` : ''}`;
  }
});
$('logout').addEventListener('click', () => { token = ''; knownOrderIds.clear(); showLoggedOut(); });
$('refresh').addEventListener('click', () => loadOrders().catch(showError));




async function updateStatus(id, status) {
  if (status === 'cancelled') {
    const confirmed = window.confirm(
      'Voulez-vous vraiment annuler cette commande ?'
    );
    if (!confirmed) return;
  }

  try {
    await api(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    await loadOrders();

    if (status === 'cancelled') {
      alert('Commande annulée.');
    }
  } catch (err) {
    showError(err);
  }
}




function orderCard(order) {
  const status = String(order.status || '')
    .trim()
    .toLowerCase();

  const items = (order.items || [])
    .map(i => `<li>${escapeHtml(i.quantity)} × ${escapeHtml(i.product_name)} — ${money(i.line_total)}</li>`)
    .join('');

  
const allowedActions = nextActions[status] || [];

const cancelAction = ['pending', 'accepted', 'preparing', 'ready'].includes(status)
  ? [{ status: 'cancelled', label: 'Annuler la commande' }]
  : [];

const actions = [
  ...allowedActions.filter(a => a.status !== 'cancelled'),
  ...cancelAction,
]
  .map(a => `
    <button
      type="button"
      class="${a.status === 'cancelled' ? 'danger' : ''}"
      data-id="${escapeHtml(order.id)}"
      data-status="${escapeHtml(a.status)}"
    >${escapeHtml(a.label)}</button>
  `)
  .join('');


  return `<article class="order ${escapeHtml(status)}">
    <h3>${escapeHtml(order.order_number)}</h3>
    <div class="status">${escapeHtml(statusLabels[status] || status)}</div>
    <p>
      <strong>${escapeHtml(order.customer_name)}</strong><br>
      ${escapeHtml(order.customer_phone)}<br>
      <span class="muted">${escapeHtml(order.customer_email || '')}</span>
    </p>
    <ul class="items">${items}</ul>
    ${order.notes ? `<p><strong>Note :</strong> ${escapeHtml(order.notes)}</p>` : ''}
    <p><strong>Total : ${money(order.total)}</strong> · Espèces au retrait · ${order.payment_status === 'paid' ? 'Payée' : 'Non payée'}</p>
    <p class="muted">Créée : ${order.created_at ? new Date(order.created_at).toLocaleString('fr-FR') : '—'}</p>
    <div class="order-footer">
      <span class="muted">ID ${escapeHtml(order.id)}</span>
      <div class="actions">${actions}</div>
    </div>
  </article>`;
}

async function loadOrders() {
  if (!token) return;
  const data = await api('/api/orders/admin/all');
  const orders = data.orders || [];
  const pendingIds = orders.filter(o => o.status === 'pending').map(o => String(o.id));
  const hasNew = pendingIds.some(id => !knownOrderIds.has(id));
  if (hasNew && knownOrderIds.size) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass(), osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = 880; gain.gain.value = 0.08;
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.25);
        osc.onended = () => ctx.close();
      }
    } catch {}
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nouvelle commande — FastFood One', {body:`${pendingIds.length} commande(s) en attente. Ouvrez le tableau de bord.`});
    }
    document.title = '🔔 Nouvelle commande — FastFood One';
  } else document.title = 'FastFood One — Restaurant';

  knownOrderIds = new Set(orders.map(o => String(o.id)));
  $('summary').innerHTML = ['pending','accepted','preparing','ready'].map(s =>
    `<span class="pill">${statusLabels[s]} : <strong>${orders.filter(o => o.status === s).length}</strong></span>`
  ).join('');
  $('orders').innerHTML = orders.length ? orders.map(orderCard).join('') : '<div class="empty">Aucune commande pour le moment.</div>';
  $('orders').querySelectorAll('button[data-status]').forEach(b => b.addEventListener('click', () => updateStatus(b.dataset.id, b.dataset.status)));
  $('last-refresh').textContent = `Mis à jour à ${new Date().toLocaleTimeString('fr-FR')} · actualisation toutes les 10 secondes`;
  $('global-error').textContent = '';
}

function switchPanel(panel) {
  activePanel = panel;

  $('orders-panel').classList.toggle('hidden', panel !== 'orders');
  $('products-panel').classList.toggle('hidden', panel !== 'products');
  $('meals-panel').classList.toggle('hidden', panel !== 'meals');

  $('tab-orders').classList.toggle('active', panel === 'orders');
  $('tab-products').classList.toggle('active', panel === 'products');
  $('tab-meals').classList.toggle('active', panel === 'meals');

  $('tab-orders').classList.toggle('secondary', panel !== 'orders');
  $('tab-products').classList.toggle('secondary', panel !== 'products');
  $('tab-meals').classList.toggle('secondary', panel !== 'meals');

  if (panel === 'orders') loadOrders().catch(showError);
  if (panel === 'products') loadProducts().catch(showError);
  if (panel === 'meals') loadMealOptions();
}

$('tab-orders').addEventListener('click', () => switchPanel('orders'));
$('tab-products').addEventListener('click', () => switchPanel('products'));
$('tab-meals').addEventListener('click', () => switchPanel('meals'));
$('tab-orders').addEventListener('click', () => switchPanel('orders'));
$('tab-products').addEventListener('click', () => switchPanel('products'));
function productMessage(message, isError=false) {
  $('product-message').textContent = message;
  $('product-message').className = isError ? 'error' : 'muted';
}
function resetProductForm() {
  $('product-form').reset();
  $('product-id').value = '';
  $('product-category').value = 'Pizza';
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
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
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
  const formData = new FormData(); formData.append('image', file);
  const result = await api('/api/products/upload-image', {method:'POST', body:formData});
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
      name:$('product-name').value.trim(),
      description:$('product-description').value.trim(),
      category:$('product-category').value,
      price:Number($('product-price').value),
      image_url
    };
    const id = $('product-id').value;
    await api(id ? `/api/products/${encodeURIComponent(id)}` : '/api/products', {
      method:id ? 'PATCH' : 'POST', body:JSON.stringify(payload)
    });
    resetProductForm(); productMessage('Plat enregistré avec succès.');
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
      <div class="product-card-content">
        <div class="product-card-top"><h3>${escapeHtml(p.name)}</h3><span class="availability ${Number(p.is_available) ? 'available' : 'unavailable'}">${Number(p.is_available) ? 'Disponible' : 'Indisponible'}</span></div>
        <p class="muted">${escapeHtml(p.category || 'Fast-food')}</p><p>${escapeHtml(p.description || 'Aucune description')}</p><strong>${money(p.price)}</strong>
        <div class="product-actions">
          <button data-edit-product="${escapeHtml(p.id)}" type="button">Modifier</button>
          <button data-toggle-product="${escapeHtml(p.id)}" data-available="${Number(p.is_available) ? '1':'0'}" class="secondary" type="button">${Number(p.is_available) ? 'Désactiver':'Activer'}</button>
          <button data-delete-product="${escapeHtml(p.id)}" class="danger" type="button">Supprimer</button>
        </div>
      </div>
    </article>`).join('') : '<div class="empty">Aucun plat. Utilisez le formulaire ci-dessus pour ajouter le premier.</div>';
  $('products-list').querySelectorAll('[data-edit-product]').forEach(b => b.addEventListener('click', () => editProduct(b.dataset.editProduct)));
  $('products-list').querySelectorAll('[data-toggle-product]').forEach(b => b.addEventListener('click', () => toggleProduct(b.dataset.toggleProduct, b.dataset.available === '1')));
  $('products-list').querySelectorAll('[data-delete-product]').forEach(b => b.addEventListener('click', () => deleteProduct(b.dataset.deleteProduct)));
}
function editProduct(id) {
  const p = products.find(item => String(item.id) === String(id)); if (!p) return;
  $('product-id').value = p.id; $('product-name').value = p.name || ''; $('product-price').value = p.price;
  const categorySelect = $('product-category');
  const savedCategory = p.category || 'Pizza';
  if (savedCategory && !Array.from(categorySelect.options).some(option => option.value === savedCategory)) {
    categorySelect.add(new Option(savedCategory, savedCategory));
  }
  categorySelect.value = savedCategory;
  $('product-description').value = p.description || '';
  selectedImageUrl = p.image_url || ''; $('product-image').value = '';
  $('product-form-title').textContent = `Modifier : ${p.name}`;
  $('save-product').textContent = 'Enregistrer les modifications'; $('cancel-edit').classList.remove('hidden');
  if (selectedImageUrl) {
    $('image-preview').src = selectedImageUrl; $('image-preview').classList.remove('hidden'); $('image-placeholder').classList.add('hidden');
  } else {
    $('image-preview').classList.add('hidden'); $('image-placeholder').classList.remove('hidden');
  }
  productMessage('Choisissez une nouvelle photo uniquement si vous souhaitez remplacer l’actuelle.');
  $('product-form-title').scrollIntoView({behavior:'smooth',block:'start'});
}
async function toggleProduct(id, currentlyAvailable) {
  try {
    await api(`/api/products/${encodeURIComponent(id)}/availability`, {method:'PATCH',body:JSON.stringify({is_available:!currentlyAvailable})});
    await loadProducts();
  } catch (err) { showError(err); }
}
async function deleteProduct(id) {
  const p = products.find(item => String(item.id) === String(id));
  if (!p || !window.confirm(`Supprimer « ${p.name} » ? Cette action est définitive.`)) return;
  try {
    await api(`/api/products/${encodeURIComponent(id)}`, {method:'DELETE'});
    await loadProducts(); productMessage('Plat supprimé.');
  } catch (err) { showError(err); }
}
// =====================================================
// FASTFOOD ONE — COMPOSITION DES REPAS
// Table MySQL : meal_options
// =====================================================

const MEAL_OPTIONS_API = '/api/meal-composition/options';

const mealGroups = {
  base: 'Base',
  viande: 'Viande',
  accompagnement: 'Accompagnement',
  legumes: 'Légumes',
  boisson: 'Boisson',
  supplements: 'Suppléments',
};

let mealOptions = [];

function mealOptionMessage(message, isError = false) {
  const el = $('meal-option-message');
  if (!el) return;

  el.textContent = message;
  el.className = isError ? 'error' : 'muted';
}

function resetMealOptionForm() {
  $('meal-option-form').reset();
  $('meal-option-id').value = '';
  $('meal-option-group').value = 'base';
  $('meal-option-price').value = '';
  $('meal-option-sort').value = '0';
  $('meal-option-available').checked = true;
  $('save-meal-option').textContent = 'Enregistrer l’élément';
  $('cancel-meal-edit').classList.add('hidden');

  mealOptionMessage('');
}

$('meal-option-form').addEventListener('submit', async event => {
  event.preventDefault();

  if (!token) {
    mealOptionMessage('Veuillez vous connecter.', true);
    return;
  }

  const button = $('save-meal-option');
  button.disabled = true;

  try {
    const name = $('meal-option-name').value.trim();
    const priceText = $('meal-option-price').value.trim();
    const price = Number(priceText);
    const sortOrder = Number($('meal-option-sort').value || 0);

    if (!name || !priceText || !Number.isFinite(price) || price < 0) {
      throw new Error('Saisissez un nom et un prix valide.');
    }

    if (!Number.isInteger(sortOrder)) {
      throw new Error('L’ordre d’affichage doit être un nombre entier.');
    }

    const payload = {
      group_key: $('meal-option-group').value,
      name,
      description:
        $('meal-option-description').value.trim() || null,
      price,
      image_url: $('meal-option-image').value.trim() || null,
      is_available: $('meal-option-available').checked ? 1 : 0,
      sort_order: sortOrder,
    };

    const id = $('meal-option-id').value.trim();

    mealOptionMessage('Enregistrement en cours…');

    await api(
      id
        ? `${MEAL_OPTIONS_API}/${encodeURIComponent(id)}`
        : MEAL_OPTIONS_API,
      {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      }
    );

    resetMealOptionForm();

    mealOptionMessage(
      id
        ? 'Modification enregistrée avec succès.'
        : 'Élément ajouté avec succès.'
    );

    await loadMealOptions();
  } catch (err) {
    mealOptionMessage(
      err.message || 'Impossible d’enregistrer cet élément.',
      true
    );
  } finally {
    button.disabled = false;
  }
});

$('cancel-meal-edit').addEventListener('click', resetMealOptionForm);

async function loadMealOptions() {
  if (!token) return;

  try {
    const data = await api(MEAL_OPTIONS_API);
    mealOptions = Array.isArray(data.options) ? data.options : [];

    renderMealOptions();
  } catch (err) {
    mealOptionMessage(
      `Chargement impossible : ${err.message || err}`,
      true
    );
  }
}

function renderMealOptions() {
  const container = $('meal-options-list');

  if (!container) return;

  if (!mealOptions.length) {
    container.innerHTML =
      '<div class="empty">Aucun élément enregistré pour le moment.</div>';
    return;
  }

  container.innerHTML = mealOptions.map(option => {
    const id = escapeHtml(option.id);
    const available = Number(option.is_available) === 1;

    return `
      <article class="product-card">
        ${
          option.image_url
            ? `<img
                class="product-card-image"
                src="${escapeHtml(option.image_url)}"
                alt="${escapeHtml(option.name)}"
                loading="lazy"
              >`
            : '<div class="product-card-placeholder">🍽️</div>'
        }

        <div class="product-card-content">
          <div class="product-card-top">
            <h3>${escapeHtml(option.name)}</h3>
            <span class="availability ${
              available ? 'available' : 'unavailable'
            }">
              ${available ? 'Disponible' : 'Indisponible'}
            </span>
          </div>

          <p class="muted">
            ${escapeHtml(mealGroups[option.group_key] || option.group_key)}
          </p>

          <p>${escapeHtml(option.description || 'Aucune description')}</p>

          <strong>${money(option.price)}</strong>

          <div class="product-actions">
            <button type="button" data-edit-meal="${id}">
              Modifier
            </button>

            <button
              type="button"
              class="secondary"
              data-toggle-meal="${id}"
            >
              ${available ? 'Désactiver' : 'Activer'}
            </button>

            <button
              type="button"
              class="danger"
              data-delete-meal="${id}"
            >
              Supprimer
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-edit-meal]').forEach(button => {
    button.addEventListener('click', () => {
      editMealOption(button.dataset.editMeal);
    });
  });

  container.querySelectorAll('[data-toggle-meal]').forEach(button => {
    button.addEventListener('click', () => {
      toggleMealOption(button.dataset.toggleMeal);
    });
  });

  container.querySelectorAll('[data-delete-meal]').forEach(button => {
    button.addEventListener('click', () => {
      deleteMealOption(button.dataset.deleteMeal);
    });
  });
}

function editMealOption(id) {
  const option = mealOptions.find(
    item => String(item.id) === String(id)
  );

  if (!option) return;

  $('meal-option-id').value = option.id;
  $('meal-option-group').value = option.group_key;
  $('meal-option-name').value = option.name || '';
  $('meal-option-description').value = option.description || '';
  $('meal-option-price').value = option.price;
  $('meal-option-image').value = option.image_url || '';
  $('meal-option-sort').value = option.sort_order ?? 0;
  $('meal-option-available').checked =
    Number(option.is_available) === 1;

  $('save-meal-option').textContent = 'Enregistrer les modifications';
  $('cancel-meal-edit').classList.remove('hidden');

  mealOptionMessage(`Modification de : ${option.name}`);

  $('meal-option-form').scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

async function toggleMealOption(id) {
  const option = mealOptions.find(
    item => String(item.id) === String(id)
  );

  if (!option) return;

  try {
    await api(
      `${MEAL_OPTIONS_API}/${encodeURIComponent(id)}/availability`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          is_available: Number(option.is_available) === 1 ? 0 : 1,
        }),
      }
    );

    mealOptionMessage('Disponibilité mise à jour.');
    await loadMealOptions();
  } catch (err) {
    mealOptionMessage(
      err.message || 'Impossible de modifier la disponibilité.',
      true
    );
  }
}

async function deleteMealOption(id) {
  const option = mealOptions.find(
    item => String(item.id) === String(id)
  );

  if (!option) return;

  if (!window.confirm(
    `Supprimer « ${option.name} » ? Cette action est définitive.`
  )) {
    return;
  }

  try {
    await api(
      `${MEAL_OPTIONS_API}/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );

    mealOptionMessage('Élément supprimé.');
    await loadMealOptions();
  } catch (err) {
    mealOptionMessage(
      err.message || 'Impossible de supprimer cet élément.',
      true
    );
  }
}