/* ════════════════════════════════════════════════════════════════
   BIMXcloud Store — store.js
   Products are loaded exclusively from Frappe Webshop.
   If no published items exist the store shows an empty state.
   Items are grouped by their Frappe Item Group.
   ════════════════════════════════════════════════════════════════ */

'use strict';

// ─── ACTIVE PRODUCTS (populated from Frappe Webshop) ─────────────
let PRODUCTS = [];

const DEFAULT_ICON_SVG = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none">
  <rect x="10" y="10" width="44" height="44" rx="10" fill="rgba(0,180,255,0.08)" stroke="rgba(0,180,255,0.35)" stroke-width="1.5"/>
  <path d="M22 32h20M32 22v20" stroke="rgba(0,180,255,0.6)" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// ─── CART STATE ──────────────────────────────────────────────────
const Cart = {
  _items: [],

  init() {
    try {
      const saved = localStorage.getItem('bxc_cart');
      if (saved) this._items = JSON.parse(saved);
    } catch (e) { this._items = []; }
    this._sync();
  },

  _save() {
    try { localStorage.setItem('bxc_cart', JSON.stringify(this._items)); } catch(e) {}
  },

  _sync() {
    const count = this._items.reduce((n, i) => n + i.qty, 0);
    const badge = document.getElementById('cart-count');
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('visible', count > 0);
    }
  },

  add(item_code) {
    const product = PRODUCTS.find(p => p.item_code === item_code);
    if (!product) return;
    const existing = this._items.find(i => i.item_code === item_code);
    if (existing) { existing.qty += 1; }
    else { this._items.push({ item_code, name: product.item_name, price: product.price, qty: 1 }); }
    this._save();
    this._sync();
    showToast(`${product.item_name} añadido al carrito`);
  },

  remove(item_code) {
    this._items = this._items.filter(i => i.item_code !== item_code);
    this._save();
    this._sync();
  },

  total() {
    return this._items.reduce((sum, i) => sum + i.price * i.qty, 0);
  },

  items() { return [...this._items]; }
};

// ─── MAP SSR ITEMS → PRODUCT SCHEMA ──────────────────────────────
// Products are injected server-side by store.py via window.__STORE_PRODUCTS__
// No runtime API calls needed.

// ─── BUILD FILTER PILLS ───────────────────────────────────────────
function buildFilterPills() {
  const container = document.getElementById('filter-pills');
  if (!container) return;

  // Remove all group pills, keep only "Todos"
  container.querySelectorAll('[data-filter]:not([data-filter="all"])').forEach(p => p.remove());

  const groups = [...new Set(PRODUCTS.map(p => p.category))].sort();
  groups.forEach(group => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.dataset.filter = group;
    btn.textContent = group;
    container.appendChild(btn);
  });
}

// ─── RENDER PRODUCTS ─────────────────────────────────────────────
function formatPrice(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);
}

function renderCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.dataset.category = product.category;
  card.dataset.price = product.price;

  const iconHtml = product.website_image
    ? `<img src="${product.website_image}" alt="${product.item_name}" class="product-card__img" loading="lazy" />`
    : DEFAULT_ICON_SVG;

  card.innerHTML = `
    <div class="product-card__media">
      <span class="product-card__badge">${product.category}</span>
      <div class="product-card__icon">${iconHtml}</div>
    </div>
    <div class="product-card__body">
      <h2 class="product-card__name">${product.item_name}</h2>
      <p class="product-card__desc">${product.description}</p>
    </div>
    <div class="product-card__footer">
      <div class="product-card__price-block">
        <div class="product-card__price">${formatPrice(product.price)} <em>/ mes</em></div>
        <div class="product-card__tax">+ IVA</div>
      </div>
      <div class="product-card__ctas">
        <button class="card-btn-quick" data-code="${product.item_code}" aria-label="Vista rápida">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button class="card-btn-cart" data-code="${product.item_code}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          Añadir
        </button>
      </div>
    </div>
  `;

  card.querySelector('.card-btn-cart').addEventListener('click', e => {
    e.stopPropagation();
    Cart.add(product.item_code);
  });
  card.querySelector('.card-btn-quick').addEventListener('click', e => {
    e.stopPropagation();
    openModal(product);
  });
  card.addEventListener('click', () => openModal(product));
  return card;
}

function renderGrid(products) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!products.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      <p>No se encontraron productos.</p>
    </div>`;
    return;
  }

  if (activeFilter === 'all') {
    // Group by item_group, preserving insertion order from Frappe
    const groups = {};
    products.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });

    Object.entries(groups).forEach(([group, items]) => {
      const section = document.createElement('section');
      section.className = 'product-group';
      const title = document.createElement('h2');
      title.className = 'product-group__title';
      title.textContent = group;
      const groupGrid = document.createElement('div');
      groupGrid.className = 'product-group__grid';
      items.forEach(p => groupGrid.appendChild(renderCard(p)));
      section.appendChild(title);
      section.appendChild(groupGrid);
      grid.appendChild(section);
    });
  } else {
    products.forEach(p => grid.appendChild(renderCard(p)));
  }
}

// ─── FILTER & SORT ────────────────────────────────────────────────
let activeFilter = 'all';
let activeSort   = 'default';

function applyFilterSort() {
  let result = [...PRODUCTS];
  if (activeFilter !== 'all') result = result.filter(p => p.category === activeFilter);
  if (activeSort === 'price-asc')  result.sort((a, b) => a.price - b.price);
  if (activeSort === 'price-desc') result.sort((a, b) => b.price - a.price);
  renderGrid(result);
}

// Event delegation on the pills container handles both "Todos" and dynamic group pills
const _pillsContainer = document.getElementById('filter-pills');
if (_pillsContainer) {
  _pillsContainer.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    _pillsContainer.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('pill--active'));
    btn.classList.add('pill--active');
    activeFilter = btn.dataset.filter;
    applyFilterSort();
  });
}

const _sortSelect = document.getElementById('sort-select');
if (_sortSelect) _sortSelect.addEventListener('change', e => {
  activeSort = e.target.value;
  applyFilterSort();
});

// ─── QUICK-VIEW MODAL ─────────────────────────────────────────────
function openModal(product) {
  const overlay = document.getElementById('modal-overlay');
  const body    = document.getElementById('modal-body');

  const iconHtml = product.website_image
    ? `<img src="${product.website_image}" alt="${product.item_name}" />`
    : DEFAULT_ICON_SVG.replace('width="64" height="64"', 'width="88" height="88"');

  body.innerHTML = `
    <div class="modal__media">${iconHtml}</div>
    <div class="modal__tag">${product.category}</div>
    <h2 class="modal__name">${product.item_name}</h2>
    <p class="modal__desc">${product.description}</p>
    <div class="modal__footer">
      <div class="modal__price">${formatPrice(product.price)} <span>/ mes + IVA</span></div>
      <button class="btn btn--primary" id="modal-add-cart" data-code="${product.item_code}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        Añadir al Carrito
      </button>
    </div>
  `;

  body.querySelector('#modal-add-cart').addEventListener('click', () => {
    Cart.add(product.item_code);
    closeModal();
  });

  overlay.removeAttribute('hidden');
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('visible');
  setTimeout(() => overlay.setAttribute('hidden', ''), 250);
}

const _modalClose = document.getElementById('modal-close');
if (_modalClose) _modalClose.addEventListener('click', closeModal);
const _modalOverlay = document.getElementById('modal-overlay');
if (_modalOverlay) _modalOverlay.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ─── TOAST ────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  document.getElementById('toast-msg').textContent = msg;
  toast.removeAttribute('hidden');
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.setAttribute('hidden', ''), 350);
  }, 2800);
}

// ─── NAV SCROLL ───────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ─── HAMBURGER ────────────────────────────────────────────────────
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mobile-menu').classList.toggle('open');
});

// ─── AUTH AWARENESS ───────────────────────────────────────────────
function updateAuthUI() {
  const loggedIn = window.frappe?.session?.user && frappe.session.user !== 'Guest';
  const btn    = document.getElementById('nav-auth-btn');
  const mobBtn = document.getElementById('mobile-auth-btn');
  if (loggedIn) {
    if (btn)    { btn.textContent    = 'Mi Portal'; btn.href    = '/customer_portal'; }
    if (mobBtn) { mobBtn.textContent = 'Mi Portal'; mobBtn.href = '/customer_portal'; }
  }
}

// ─── INIT ─────────────────────────────────────────────────────────
(function init() {
  Cart.init();
  updateAuthUI();

  // Products are injected by store.py into window.__STORE_PRODUCTS__
  const ssrProducts = window.__STORE_PRODUCTS__;
  if (Array.isArray(ssrProducts) && ssrProducts.length > 0) {
    PRODUCTS = ssrProducts;
    buildFilterPills();
  }

  applyFilterSort();
})();
