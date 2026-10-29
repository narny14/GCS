
'use strict';

/* =========================================================
   FASTFOOD ONE — TABLEAU DE BORD ADMINISTRATEUR
   Commandes, plats et composition des repas
   ========================================================= */

const API_BASE_URL =
  'https://gcs-byteatomeneons-com-216696.hostingersite.com';

const $ = id => document.getElementById(id);

let token = '';
let knownOrderIds = new Set();
let refreshTimer = null;
let products = [];
let mealOptions = [];
let selectedImageUrl = '';
let previewObjectUrl = '';
let activePanel = 'orders';

const MEAL_OPTIONS_API = '/api/meal-composition/options';

const statusLabels = {
  pending: 'Nouvelle',
  accepted: 'Acceptée',
  preparing: 'En préparation',
  ready: 'Prête au retrait',
  picked_up: 'Récupérée',
  cancelled: 'Annulée',
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

const mealGroups = {
  base: 'Base',
  viande: 'Viande',
  accompagnement: 'Accompagnement',
  legumes: 'Légumes',
  boisson: 'Boisson',
  supplements: 'Suppléments',
};

/* -------------------- OUTILS GÉNÉRAUX -------------------- */

function bind(id, eventName, callback) {
  const element = $(id);

  if (!element) {
    console.error(`[FASTFOOD] Élément HTML absent : #${id}`);
    return;
  }

  element.addEventListener(eventName, callback);
}

function money(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(value || 0));
}

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;

  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

async function api(path, options = {}) {
  const isFormData =
    typeof FormData !== 'undefined' &&
    options.body instanceof FormData;

  const headers = {
    ...(!isFormData && options.body
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;

  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error(
      "Impossible de joindre l'API. Vérifie le serveur et la configuration CORS."
    );
  }

  const contentType = response.headers.get('content-type') || '';

  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {
        error: (await response.text().catch(() => '')).slice(0, 300),
      };

  if (!response.ok) {
    const error = new Error(
      body.error ||
      body.message ||
      `Erreur HTTP ${response.status}`
    );

    error.status = response.status;
    error.url = apiUrl(path);

    throw error;
  }

  return body;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function showError(error) {
  const element = $('global-error');
  if (!element) {
    console.error('[FASTFOOD]', error);
    return;
  }

  element.textContent =
    `${error.message || String(error)}` +
    `${error.url ? ` — ${error.url}` : ''}`;
}

function showLoggedIn() {
  $('login-panel')?.classList.add('hidden');
  $('app-panel')?.classList.remove('hidden');
  $('logout')?.classList.remove('hidden');
}

function showLoggedOut() {
  $('login-panel')?.classList.remove('hidden');
  $('app-panel')?.classList.add('hidden');
  $('logout')?.classList.add('hidden');

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

/* -------------------- CONNEXION -------------------- */

bind('login-form', 'submit', async event => {
  event.preventDefault();

  const loginError = $('login-error');
  if (loginError) loginError.textContent = 'Connexion en cours…';

  try {
    const email = $('email')?.value.trim();
    const password = $('password')?.value;

    if (!email || !password) {
      throw new Error('Saisis ton adresse e-mail et ton mot de passe.');
    }

    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!data.user || data.user.role !== 'admin') {
      throw new Error(
        "Ce compte n'a pas le rôle administrateur attendu."
      );
    }

    if (!data.token) {
      throw new Error('Aucun jeton reçu du serveur.');
    }

    token = data.token;

    if (loginError) loginError.textContent = '';

    showLoggedIn();

    if (
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.warn('[FASTFOOD] Notifications non activées.', error);
      }
    }

    // Afficher les commandes même si un autre chargement échoue.
    try {
      await loadOrders();
    } catch (error) {
      showError(error);
    }

    try {
      await loadProducts();
    } catch (error) {
      showError(error);
    }

    try {
      await loadMealOptions();
    } catch (error) {
      mealOptionMessage(error.message, true);
    }

    if (refreshTimer) clearInterval(refreshTimer);

    refreshTimer = setInterval(() => {
      loadOrders().catch(showError);

      if (activePanel === 'products') {
        loadProducts().catch(showError);
      }

      if (activePanel === 'meals') {
        loadMealOptions();
      }
    }, 10000);

  } catch (error) {
    if (loginError) {
      loginError.textContent =
        `${error.message || 'Échec de connexion'}` +
        `${error.url ? ` — ${error.url}` : ''}`;
    } else {
      showError(error);
    }
  }
});

bind('logout', 'click', () => {
  token = '';
  knownOrderIds.clear();
  showLoggedOut();
});

bind('refresh', 'click', () => {
  loadOrders().catch(showError);
});

/* -------------------- NAVIGATION DES PANNEAUX -------------------- */


/* -------- NAVIGATION CORRIGÉE DES PANNEAUX -------- */
function switchPanel(panel) {
  const panels = {
    orders:   'orders-panel',
    products: 'products-panel',
    meals:    'meals-panel',
  };

  if (!Object.prototype.hasOwnProperty.call(panels, panel)) {
    console.error('[FASTFOOD] Panneau inconnu :', panel);
    return;
  }

  // 1) Basculer la visibilité des panneaux
  for (const [name, id] of Object.entries(panels)) {
    const el = document.getElementById(id);
    if (!el) {
      console.error('[FASTFOOD] Élément HTML absent : #' + id);
      continue;
    }
    el.classList.toggle('hidden', name !== panel);
  }

  activePanel = panel;

  // 2) Mettre à jour l'état des onglets
  for (const name of Object.keys(panels)) {
    const btn = document.getElementById('tab-' + name);
    if (!btn) continue;
    btn.classList.toggle('active', name === panel);
    btn.classList.toggle('secondary', name !== panel);
    btn.setAttribute('aria-selected', String(name === panel));
  }

  // 3) Charger les données du panneau (seulement si connecté)
  if (!token) {
    console.warn('[FASTFOOD] Non connecté — pas de chargement.');
    return;
  }

  if (panel === 'orders')        loadOrders().catch(showError);
  else if (panel === 'products') loadProducts().catch(showError);
  else if (panel === 'meals')    loadMealOptions(); // gère ses erreurs en interne
}

function initializeNavigation() {
  ['orders', 'products', 'meals'].forEach(panel => {
    const button = document.getElementById('tab-' + panel);
    if (!button) {
      console.error('[FASTFOOD] Bouton introuvable : #tab-' + panel);
      return;
    }

    if (button.tagName === 'BUTTON') button.type = 'button';

    button.addEventListener('click', event => {
      event.preventDefault();
      console.log('[FASTFOOD] Clic onglet :', panel);
      switchPanel(panel);
    });
  });

  console.log('[FASTFOOD] Navigation initialisée.');
}


/* -------------------- COMMANDES -------------------- */

async function updateStatus(id, status) {
  if (status === 'cancelled') {
    if (!window.confirm('Voulez-vous vraiment annuler cette commande ?')) {
      return;
    }
  }

  try {
    await api(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    await loadOrders();

    if (status === 'cancelled') {
      window.alert('Commande annulée.');
    }
  } catch (error) {
    showError(error);
  }
}

function orderCard(order) {
  const status = String(order.status || '').trim().toLowerCase();

  const items = (order.items || [])
    .map(item =>
      `<li>${escapeHtml(item.quantity)} × ` +
      `${escapeHtml(item.product_name)} — ${money(item.line_total)}</li>`
    )
    .join('');

  const actions = (nextActions[status] || [])
    .map(action => `
      <button
        type="button"
        class="${action.status === 'cancelled' ? 'danger' : ''}"
        data-id="${escapeHtml(order.id)}"
        data-status="${escapeHtml(action.status)}"
      >${escapeHtml(action.label)}</button>
    `)
    .join('');

  return `
    <article class="order ${escapeHtml(status)}">
      <h3>${escapeHtml(order.order_number)}</h3>
      <div class="status">${escapeHtml(statusLabels[status] || status)}</div>
      <p>
        <strong>${escapeHtml(order.customer_name)}</strong><br>
        ${escapeHtml(order.customer_phone)}<br>
        <span class="muted">${escapeHtml(order.customer_email || '')}</span>
      </p>
      <ul class="items">${items}</ul>
      ${order.notes
        ? `<p><strong>Note :</strong> ${escapeHtml(order.notes)}</p>`
        : ''}
      <p>
        <strong>Total : ${money(order.total)}</strong> · Espèces au retrait ·
        ${order.payment_status === 'paid' ? 'Payée' : 'Non payée'}
      </p>
      <p class="muted">
        Créée : ${order.created_at
          ? new Date(order.created_at).toLocaleString('fr-FR')
          : '—'}
      </p>
      <div class="order-footer">
        <span class="muted">ID ${escapeHtml(order.id)}</span>
        <div class="actions">${actions}</div>
      </div>
    </article>
  `;
}

async function loadOrders() {
  if (!token) return;

  const data = await api('/api/orders/admin/all');
  const orders = data.orders || [];

  const pendingIds = orders
    .filter(order => order.status === 'pending')
    .map(order => String(order.id));

  const hasNew = pendingIds.some(id => !knownOrderIds.has(id));

  if (hasNew && knownOrderIds.size) {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass) {
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.frequency.value = 880;
        gain.gain.value = 0.08;

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start();
        oscillator.stop(context.currentTime + 0.25);

        oscillator.onended = () => context.close();
      }
    } catch (error) {
      console.warn('[FASTFOOD] Son indisponible.', error);
    }

    if (
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification('Nouvelle commande — FastFood One', {
        body: `${pendingIds.length} commande(s) en attente.`,
      });
    }

    document.title = '🔔 Nouvelle commande — FastFood One';
  } else {
    document.title = 'FastFood One — Restaurant';
  }

  knownOrderIds = new Set(orders.map(order => String(order.id)));

  if ($('summary')) {
    $('summary').innerHTML = [
      'pending',
      'accepted',
      'preparing',
      'ready',
    ].map(status =>
      `<span class="pill">${statusLabels[status]} : ` +
      `<strong>${orders.filter(order => order.status === status).length}</strong></span>`
    ).join('');
  }

  if ($('orders')) {
    $('orders').innerHTML = orders.length
      ? orders.map(orderCard).join('')
      : '<div class="empty">Aucune commande pour le moment.</div>';

    $('orders').querySelectorAll('button[data-status]').forEach(button => {
      button.addEventListener('click', () => {
        updateStatus(button.dataset.id, button.dataset.status);
      });
    });
  }

  if ($('last-refresh')) {
    $('last-refresh').textContent =
      `Mis à jour à ${new Date().toLocaleTimeString('fr-FR')} · ` +
      'actualisation toutes les 10 secondes';
  }

  if ($('global-error')) $('global-error').textContent = '';
}

/* -------------------- PLATS -------------------- */

function productMessage(message, isError = false) {
  const element = $('product-message');
  if (!element) return;

  element.textContent = message;
  element.className = isError ? 'error' : 'muted';
}

function resetProductForm() {
  $('product-form')?.reset();

  if ($('product-id')) $('product-id').value = '';
  if ($('product-category')) $('product-category').value = 'Pizza';

  if ($('product-form-title')) {
    $('product-form-title').textContent = 'Ajouter un plat';
  }

  if ($('save-product')) {
    $('save-product').textContent = 'Enregistrer le plat';
  }

  $('cancel-edit')?.classList.add('hidden');

  if ($('product-image')) $('product-image').value = '';

  selectedImageUrl = '';

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
  }

  if ($('image-preview')) {
    $('image-preview').removeAttribute('src');
    $('image-preview').classList.add('hidden');
  }

  $('image-placeholder')?.classList.remove('hidden');

  productMessage('');
}

bind('cancel-edit', 'click', resetProductForm);

bind('product-image', 'change', () => {
  const file = $('product-image')?.files?.[0];

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
  }

  if (!file) {
    if ($('image-preview')) {
      $('image-preview').classList.toggle('hidden', !selectedImageUrl);
      if (selectedImageUrl) $('image-preview').src = selectedImageUrl;
    }

    $('image-placeholder')?.classList.toggle('hidden', !!selectedImageUrl);
    return;
  }

  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    $('product-image').value = '';
    productMessage(
      'Format non accepté ou image supérieure à 5 Mo. Utilisez JPG, PNG ou WEBP.',
      true
    );
    return;
  }

  previewObjectUrl = URL.createObjectURL(file);

  if ($('image-preview')) {
    $('image-preview').src = previewObjectUrl;
    $('image-preview').classList.remove('hidden');
  }

  $('image-placeholder')?.classList.add('hidden');

  productMessage('Photo prête à être envoyée.');
});

async function uploadSelectedImage() {
  const file = $('product-image')?.files?.[0];

  if (!file) return selectedImageUrl || null;

  const formData = new FormData();
  formData.append('image', file);

  const result = await api('/api/products/upload-image', {
    method: 'POST',
    body: formData,
  });

  return result.image_url;
}

bind('product-form', 'submit', async event => {
  event.preventDefault();
  if (!token) return;

  const button = $('save-product');
  if (button) button.disabled = true;

  try {
    productMessage('Envoi de la photo et enregistrement…');

    const image_url = await uploadSelectedImage();

    const payload = {
      name: $('product-name').value.trim(),
      description: $('product-description').value.trim(),
      category: $('product-category').value,
      price: Number($('product-price').value),
      image_url,
    };

    const id = $('product-id').value;

    await api(
      id
        ? `/api/products/${encodeURIComponent(id)}`
        : '/api/products',
      {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      }
    );

    resetProductForm();
    productMessage('Plat enregistré avec succès.');

    await loadProducts();
  } catch (error) {
    productMessage(error.message || 'Échec de l’enregistrement.', true);
  } finally {
    if (button) button.disabled = false;
  }
});

async function loadProducts() {
  if (!token) return;

  const data = await api('/api/products/admin/all');
  products = data.products || [];

  const container = $('products-list');
  if (!container) return;

  container.innerHTML = products.length
    ? products.map(product => `
      <article class="product-card">
        ${product.image_url
          ? `<img class="product-card-image"
                  src="${escapeHtml(product.image_url)}"
                  alt="${escapeHtml(product.name)}"
                  loading="lazy">`
          : '<div class="product-card-placeholder">🍔</div>'}
        <div class="product-card-content">
          <div class="product-card-top">
            <h3>${escapeHtml(product.name)}</h3>
            <span class="availability ${
              Number(product.is_available) ? 'available' : 'unavailable'
            }">${
              Number(product.is_available) ? 'Disponible' : 'Indisponible'
            }</span>
          </div>
          <p class="muted">${escapeHtml(product.category || 'Fast-food')}</p>
          <p>${escapeHtml(product.description || 'Aucune description')}</p>
          <strong>${money(product.price)}</strong>
          <div class="product-actions">
            <button type="button" data-edit-product="${escapeHtml(product.id)}">Modifier</button>
            <button type="button" class="secondary"
              data-toggle-product="${escapeHtml(product.id)}"
              data-available="${Number(product.is_available) ? '1' : '0'}">
              ${Number(product.is_available) ? 'Désactiver' : 'Activer'}
            </button>
            <button type="button" class="danger"
              data-delete-product="${escapeHtml(product.id)}">Supprimer</button>
          </div>
        </div>
      </article>
    `).join('')
    : '<div class="empty">Aucun plat enregistré.</div>';

  container.querySelectorAll('[data-edit-product]').forEach(button => {
    button.addEventListener('click', () => editProduct(button.dataset.editProduct));
  });

  container.querySelectorAll('[data-toggle-product]').forEach(button => {
    button.addEventListener('click', () =>
      toggleProduct(
        button.dataset.toggleProduct,
        button.dataset.available === '1'
      )
    );
  });

  container.querySelectorAll('[data-delete-product]').forEach(button => {
    button.addEventListener('click', () =>
      deleteProduct(button.dataset.deleteProduct)
    );
  });
}

function editProduct(id) {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return;

  $('product-id').value = product.id;
  $('product-name').value = product.name || '';
  $('product-price').value = product.price;

  const categorySelect = $('product-category');
  const savedCategory = product.category || 'Pizza';

  if (
    savedCategory &&
    !Array.from(categorySelect.options).some(option => option.value === savedCategory)
  ) {
    categorySelect.add(new Option(savedCategory, savedCategory));
  }

  categorySelect.value = savedCategory;
  $('product-description').value = product.description || '';

  selectedImageUrl = product.image_url || '';
  $('product-image').value = '';

  $('product-form-title').textContent = `Modifier : ${product.name}`;
  $('save-product').textContent = 'Enregistrer les modifications';
  $('cancel-edit').classList.remove('hidden');

  if (selectedImageUrl) {
    $('image-preview').src = selectedImageUrl;
    $('image-preview').classList.remove('hidden');
    $('image-placeholder').classList.add('hidden');
  } else {
    $('image-preview').classList.add('hidden');
    $('image-placeholder').classList.remove('hidden');
  }

  productMessage('Choisissez une nouvelle photo uniquement pour remplacer l’actuelle.');

  $('product-form-title').scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

async function toggleProduct(id, currentlyAvailable) {
  try {
    await api(`/api/products/${encodeURIComponent(id)}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ is_available: !currentlyAvailable }),
    });

    await loadProducts();
  } catch (error) {
    showError(error);
  }
}

async function deleteProduct(id) {
  const product = products.find(item => String(item.id) === String(id));

  if (
    !product ||
    !window.confirm(`Supprimer « ${product.name} » ? Cette action est définitive.`)
  ) {
    return;
  }

  try {
    await api(`/api/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    await loadProducts();
    productMessage('Plat supprimé.');
  } catch (error) {
    showError(error);
  }
}

/* -------------------- COMPOSITION DES REPAS -------------------- */

function mealOptionMessage(message, isError = false) {
  const element = $('meal-option-message');
  if (!element) {
    console[isError ? 'error' : 'log']('[FASTFOOD][REPAS]', message);
    return;
  }

  element.textContent = message;
  element.className = isError ? 'error' : 'muted';
}

function resetMealOptionForm() {
  $('meal-option-form')?.reset();

  if ($('meal-option-id')) $('meal-option-id').value = '';
  if ($('meal-option-group')) $('meal-option-group').value = 'base';
  if ($('meal-option-price')) $('meal-option-price').value = '';
  if ($('meal-option-sort')) $('meal-option-sort').value = '0';
  if ($('meal-option-available')) $('meal-option-available').checked = true;

  if ($('save-meal-option')) {
    $('save-meal-option').textContent = 'Enregistrer l’élément';
  }

  $('cancel-meal-edit')?.classList.add('hidden');

  mealOptionMessage('');
}

bind('meal-option-form', 'submit', async event => {
  event.preventDefault();

  if (!token) {
    mealOptionMessage('Veuillez vous connecter.', true);
    return;
  }

  const button = $('save-meal-option');
  if (button) button.disabled = true;

  try {
    const name = $('meal-option-name').value.trim();
    const priceText = $('meal-option-price').value.trim();
    const price = Number(priceText);
    const sortOrder = Number($('meal-option-sort').value || 0);

    if (!name || priceText === '' || !Number.isFinite(price) || price < 0) {
      throw new Error('Saisissez un nom et un prix valide.');
    }

    if (!Number.isInteger(sortOrder)) {
      throw new Error('L’ordre d’affichage doit être un nombre entier.');
    }

    const payload = {
      group_key: $('meal-option-group').value,
      name,
      description: $('meal-option-description').value.trim() || null,
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
      id ? 'Modification enregistrée avec succès.' : 'Élément ajouté avec succès.'
    );

    await loadMealOptions();
  } catch (error) {
    mealOptionMessage(
      error.message || 'Impossible d’enregistrer cet élément.',
      true
    );
  } finally {
    if (button) button.disabled = false;
  }
});

bind('cancel-meal-edit', 'click', resetMealOptionForm);

async function loadMealOptions() {
  if (!token) {
    mealOptionMessage('Connecte-toi pour charger les éléments.', true);
    return;
  }

  try {
    mealOptionMessage('Chargement des éléments de composition…');

    const data = await api(MEAL_OPTIONS_API);
    console.log('[FASTFOOD][REPAS] Réponse brute API :', data);

    // Accepter plusieurs formats de réponse
    let list = [];
    if (Array.isArray(data))                list = data;
    else if (Array.isArray(data.options))   list = data.options;
    else if (Array.isArray(data.data))      list = data.data;
    else if (Array.isArray(data.results))   list = data.results;
    else if (Array.isArray(data.mealOptions)) list = data.mealOptions;

    if (!list.length && data && typeof data === 'object') {
      console.warn(
        '[FASTFOOD][REPAS] Aucune liste détectée. Clés reçues :',
        Object.keys(data)
      );
    }

    mealOptions = list;
    renderMealOptions();

    mealOptionMessage(
      mealOptions.length
        ? `${mealOptions.length} élément(s) chargé(s).`
        : 'Aucun élément enregistré pour le moment.'
    );
  } catch (error) {
    console.error('[FASTFOOD][REPAS] Erreur de chargement :', error);
    mealOptionMessage(
      `Chargement impossible : ${error.message || error}`,
      true
    );
  }
}
function renderMealOptions() {
  const container = $('meal-options-list');

  if (!container) {
    console.error('[FASTFOOD] Élément HTML absent : #meal-options-list');
    mealOptionMessage(
      'Le panneau est ouvert, mais #meal-options-list est absent du HTML.',
      true
    );
    return;
  }

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
        ${option.image_url
          ? `<img class="product-card-image"
                  src="${escapeHtml(option.image_url)}"
                  alt="${escapeHtml(option.name)}"
                  loading="lazy">`
          : '<div class="product-card-placeholder">🍽️</div>'}
        <div class="product-card-content">
          <div class="product-card-top">
            <h3>${escapeHtml(option.name)}</h3>
            <span class="availability ${
              available ? 'available' : 'unavailable'
            }">${available ? 'Disponible' : 'Indisponible'}</span>
          </div>
          <p class="muted">${
            escapeHtml(mealGroups[option.group_key] || option.group_key)
          }</p>
          <p>${escapeHtml(option.description || 'Aucune description')}</p>
          <strong>${money(option.price)}</strong>
          <div class="product-actions">
            <button type="button" data-edit-meal="${id}">Modifier</button>
            <button type="button" class="secondary" data-toggle-meal="${id}">
              ${available ? 'Désactiver' : 'Activer'}
            </button>
            <button type="button" class="danger" data-delete-meal="${id}">
              Supprimer
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('[data-edit-meal]').forEach(button => {
    button.addEventListener('click', () => editMealOption(button.dataset.editMeal));
  });

  container.querySelectorAll('[data-toggle-meal]').forEach(button => {
    button.addEventListener('click', () => toggleMealOption(button.dataset.toggleMeal));
  });

  container.querySelectorAll('[data-delete-meal]').forEach(button => {
    button.addEventListener('click', () => deleteMealOption(button.dataset.deleteMeal));
  });
}

function editMealOption(id) {
  const option = mealOptions.find(item => String(item.id) === String(id));
  if (!option) return;

  $('meal-option-id').value = option.id;
  $('meal-option-group').value = option.group_key;
  $('meal-option-name').value = option.name || '';
  $('meal-option-description').value = option.description || '';
  $('meal-option-price').value = option.price;
  $('meal-option-image').value = option.image_url || '';
  $('meal-option-sort').value = option.sort_order ?? 0;
  $('meal-option-available').checked = Number(option.is_available) === 1;

  $('save-meal-option').textContent = 'Enregistrer les modifications';
  $('cancel-meal-edit').classList.remove('hidden');

  mealOptionMessage(`Modification de : ${option.name}`);

  $('meal-option-form')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

async function toggleMealOption(id) {
  const option = mealOptions.find(item => String(item.id) === String(id));
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

    await loadMealOptions();
    mealOptionMessage('Disponibilité mise à jour.');
  } catch (error) {
    mealOptionMessage(
      error.message || 'Impossible de modifier la disponibilité.',
      true
    );
  }
}

async function deleteMealOption(id) {
  const option = mealOptions.find(item => String(item.id) === String(id));
  if (!option) return;

  if (!window.confirm(
    `Supprimer « ${option.name} » ? Cette action est définitive.`
  )) {
    return;
  }

  try {
    await api(`${MEAL_OPTIONS_API}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    await loadMealOptions();
    mealOptionMessage('Élément supprimé.');
  } catch (error) {
    mealOptionMessage(
      error.message || 'Impossible de supprimer cet élément.',
      true
    );
  }
}

/* -------------------- INITIALISATION -------------------- */

function initializeFastFoodAdmin() {
  console.log('[FASTFOOD] Initialisation du tableau de bord…');

  initializeNavigation();

  // On affiche "commandes" sans charger (token absent au démarrage)
  switchPanel('orders');

  console.log('[FASTFOOD] Initialisation terminée.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFastFoodAdmin, {
    once: true,
  });
} else {
  initializeFastFoodAdmin();
}

