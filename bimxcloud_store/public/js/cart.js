/* ════════════════════════════════════════════════════════════════
   BIMXcloud Cart — cart.js
   Renders cart items. Checkout via PayPal Orders API v2 or
   wire transfer. No Webshop dependency.
   ════════════════════════════════════════════════════════════════ */

'use strict';

const TAX_RATE = 0.16;
const CFG      = window.__CART_CONFIG__ || {};

// ─── FRAPPE API HELPER ────────────────────────────────────────────
async function frappePost(method, args = {}) {
  const res = await fetch(`/api/method/${method}`, {
    method:  'POST',
    headers: {
      'Content-Type':        'application/json',
      'X-Frappe-CSRF-Token': CFG.csrfToken || 'Guest',
    },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.exception || data?.message || `HTTP ${res.status}`);
  }
  return data.message;
}

// ─── RENDER CART ──────────────────────────────────────────────────
function renderCart() {
  const layout = document.getElementById('cart-layout');
  const items  = Cart.items();

  if (!items.length) {
    layout.innerHTML = `
      <div class="cart-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        <h2>Tu carrito está vacío</h2>
        <p>Explora nuestros servicios y encuentra el que mejor se adapte a tu empresa.</p>
        <a href="/store" class="btn btn--primary">Ver Productos</a>
      </div>`;
    return;
  }

  const subtotal = Cart.total();
  const tax      = subtotal * TAX_RATE;
  const total    = subtotal + tax;
  const fmt = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);

  const itemsHtml = items.map(item => {
    const product  = PRODUCTS.find(p => p.item_code === item.item_code) || {};
    const iconHtml = product.website_image
      ? `<img src="${product.website_image}" alt="${item.name}" style="width:36px;height:36px;object-fit:contain;" />`
      : `<svg width="36" height="36" viewBox="0 0 64 64" fill="none"><rect x="10" y="10" width="44" height="44" rx="10" fill="rgba(0,180,255,0.08)" stroke="rgba(0,180,255,0.35)" stroke-width="1.5"/><path d="M22 32h20M32 22v20" stroke="rgba(0,180,255,0.6)" stroke-width="2" stroke-linecap="round"/></svg>`;
    return `
      <div class="cart-item" data-code="${item.item_code}">
        <div class="cart-item__icon">${iconHtml}</div>
        <div class="cart-item__info">
          <div class="cart-item__name">${item.name}</div>
          <div class="cart-item__price">${fmt(item.price)}/mes <strong>· ${fmt(item.price * item.qty)} total</strong></div>
        </div>
        <div class="cart-item__qty">
          <button class="qty-btn" data-action="dec" data-code="${item.item_code}" aria-label="Reducir">−</button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-code="${item.item_code}" aria-label="Aumentar">+</button>
        </div>
        <button class="cart-item__remove" data-code="${item.item_code}" aria-label="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>`;
  }).join('');

  layout.innerHTML = `
    <div class="cart-items">${itemsHtml}</div>
    <div class="order-summary">
      <div class="summary-title">Resumen de Pedido</div>
      <div class="summary-rows">
        <div class="summary-row"><span>Subtotal (${items.length} servicio${items.length !== 1 ? 's' : ''})</span><span>${fmt(subtotal)}/mes</span></div>
        <div class="summary-row"><span>IVA (16%)</span><span>${fmt(tax)}</span></div>
        <div class="summary-row total"><span>Total</span><span class="val">${fmt(total)}<small style="font-size:12px;font-weight:400;color:var(--c-text2)">/mes</small></span></div>
      </div>

      <!-- Customer info -->
      <div class="checkout-fields">
        <input class="checkout-input" id="checkout-name"  type="text"  placeholder="Tu nombre completo" required />
        <input class="checkout-input" id="checkout-email" type="email" placeholder="Tu correo electrónico" required />
      </div>

      <!-- Payment method tabs -->
      <div class="payment-tabs" id="payment-tabs">
        <button class="payment-tab payment-tab--active" data-method="paypal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          PayPal
        </button>
        <button class="payment-tab" data-method="wire">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Transferencia
        </button>
      </div>

      <!-- PayPal panel -->
      <div class="payment-panel" id="panel-paypal">
        ${CFG.paypalClientId
          ? `<div id="paypal-button-container"></div>`
          : `<p class="payment-notice">PayPal no está configurado. Contacta al administrador.</p>`
        }
      </div>

      <!-- Wire transfer panel -->
      <div class="payment-panel hidden" id="panel-wire">
        ${buildWireHtml()}
        <button class="checkout-btn" id="wire-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z"/></svg>
          Confirmar Pedido por Transferencia
        </button>
      </div>

      <p class="cart-note">Pago seguro. Tu servicio se activa en 1–2 horas hábiles tras la confirmación.</p>
    </div>`;

  attachCartEvents(layout);
  attachCheckoutEvents();
}

// ─── WIRE TRANSFER HTML ───────────────────────────────────────────
function buildWireHtml() {
  const rows = [
    ['Banco',          CFG.wireBankName],
    ['Beneficiario',   CFG.wireAccountName],
    ['No. de Cuenta',  CFG.wireAccountNo],
    ['CLABE / Routing',CFG.wireRouting],
    ['SWIFT / BIC',    CFG.wireSwift],
    ['Dirección',      CFG.wireAddress],
  ].filter(([, v]) => v);

  if (!rows.length && !CFG.wireInstructions) {
    return `<p class="payment-notice">Datos de transferencia no configurados. Contacta al administrador.</p>`;
  }

  const tableRows = rows.map(([label, value]) =>
    `<tr><td class="wire-label">${label}</td><td class="wire-value">${value}</td></tr>`
  ).join('');

  const instructions = CFG.wireInstructions
    ? `<div class="wire-instructions">${CFG.wireInstructions}</div>`
    : '';

  return `
    <div class="wire-details">
      <p class="wire-intro">Realiza tu transferencia a la siguiente cuenta y confirma tu pedido:</p>
      <table class="wire-table">${tableRows}</table>
      ${instructions}
    </div>`;
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────
function attachCartEvents(layout) {
  layout.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code     = btn.dataset.code;
      const cartItem = Cart._items.find(i => i.item_code === code);
      if (!cartItem) return;
      if (btn.dataset.action === 'inc') {
        cartItem.qty += 1;
      } else {
        cartItem.qty -= 1;
        if (cartItem.qty <= 0) { Cart.remove(code); renderCart(); return; }
      }
      Cart._save();
      Cart._sync();
      renderCart();
    });
  });

  layout.querySelectorAll('.cart-item__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      Cart.remove(btn.dataset.code);
      renderCart();
    });
  });
}

function attachCheckoutEvents() {
  // Payment tab switching
  document.querySelectorAll('.payment-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('payment-tab--active'));
      tab.classList.add('payment-tab--active');
      const method = tab.dataset.method;
      document.getElementById('panel-paypal').classList.toggle('hidden', method !== 'paypal');
      document.getElementById('panel-wire').classList.toggle('hidden', method !== 'wire');
      if (method === 'paypal') mountPayPalButtons();
    });
  });

  // Wire transfer confirmation
  const wireBtn = document.getElementById('wire-btn');
  if (wireBtn) wireBtn.addEventListener('click', handleWireTransfer);

  // Mount PayPal buttons for the default (paypal) tab
  mountPayPalButtons();
}

// ─── VALIDATION HELPERS ───────────────────────────────────────────
function getCustomerInfo() {
  const name  = document.getElementById('checkout-name')?.value.trim();
  const email = document.getElementById('checkout-email')?.value.trim();
  if (!name)  { alert('Por favor ingresa tu nombre completo.'); return null; }
  if (!email || !email.includes('@')) { alert('Por favor ingresa un correo válido.'); return null; }
  return { name, email };
}

function cartPayload() {
  return Cart.items().map(i => ({ item_code: i.item_code, qty: i.qty }));
}

// ─── PAYPAL CHECKOUT ──────────────────────────────────────────────
// Track the DOM container that was last rendered into so we can
// detect when renderCart() has replaced it and re-mount is needed.
let _paypalContainer = null;

function mountPayPalButtons() {
  if (!CFG.paypalClientId) return;
  if (typeof paypal === 'undefined') {
    // SDK not loaded yet — retry once it's available
    setTimeout(mountPayPalButtons, 500);
    return;
  }
  const container = document.getElementById('paypal-button-container');
  if (!container) return;
  // Already mounted into this exact container element — skip
  if (_paypalContainer === container) return;

  _paypalContainer = container;
  // Clear any stale content from a previous render
  container.innerHTML = '';

  paypal.Buttons({
    style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' },

    async createOrder() {
      const info = getCustomerInfo();
      if (!info) throw new Error('Missing customer info');

      try {
        const result = await frappePost(
          'bimxcloud_store.bimxcloud_store.api.paypal.create_order',
          { cart_items: JSON.stringify(cartPayload()) }
        );
        return result.id;
      } catch (err) {
        console.error('[PayPal] createOrder failed:', err);
        throw err; // re-throw so PayPal SDK triggers onError
      }
    },

    async onApprove(data) {
      // Snapshot everything BEFORE any async work
      const info          = getCustomerInfo();
      const snapshotItems = Cart.items().slice();
      const subtotal      = Cart.total();
      const tax           = subtotal * TAX_RATE;
      const total         = subtotal + tax;

      let captureResult = null;
      try {
        console.log('[PayPal] capturing order:', data.orderID);
        captureResult = await frappePost(
          'bimxcloud_store.bimxcloud_store.api.paypal.capture_order',
          {
            paypal_order_id: data.orderID,
            cart_items:      JSON.stringify(cartPayload()),
            customer_name:   info?.name  || 'Guest',
            customer_email:  info?.email || '',
          }
        );
        console.log('[PayPal] capture result:', captureResult);
      } catch (err) {
        console.error('[PayPal] capture failed:', err);
        alert(`Error al capturar el pago: ${err.message}`);
        return;
      }

      // Clear cart
      Cart._items = [];
      Cart._save();
      Cart._sync();

      // Wait for PayPal's popup/overlay to finish closing, then show receipt
      setTimeout(() => {
        try {
          showPayPalReceiptModal(captureResult, snapshotItems, info, subtotal, tax, total);
        } catch (err) {
          console.error('[PayPal] receipt modal error:', err);
          showOrderConfirmation(captureResult.order_name, 'paypal');
        }
      }, 400);
    },

    onError(err) {
      console.error('[PayPal] SDK error:', err);
      alert('Hubo un error con PayPal. Por favor intenta de nuevo o usa Transferencia Bancaria.');
    },

    onCancel() {
      // User closed the PayPal popup — no action needed
    },
  }).render('#paypal-button-container');
}

// ─── WIRE TRANSFER CHECKOUT ───────────────────────────────────────
async function handleWireTransfer() {
  const info = getCustomerInfo();
  if (!info) return;

  // Snapshot cart before clearing
  const snapshotItems   = Cart.items().slice();
  const subtotal        = Cart.total();
  const tax             = subtotal * TAX_RATE;
  const total           = subtotal + tax;

  const btn = document.getElementById('wire-btn');
  btn.disabled = true;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".2"/><path d="M21 12a9 9 0 00-9-9"/></svg> Procesando...`;

  try {
    const result = await frappePost(
      'bimxcloud_store.bimxcloud_store.api.paypal.wire_transfer_order',
      {
        cart_items:     JSON.stringify(cartPayload()),
        customer_name:  info.name,
        customer_email: info.email,
      }
    );
    Cart._items = [];
    Cart._save();
    Cart._sync();
    showWireReceiptModal(result, snapshotItems, info, subtotal, tax, total);
  } catch (err) {
    alert(`Error al registrar el pedido: ${err.message}`);
    btn.disabled = false;
    btn.innerHTML = 'Confirmar Pedido por Transferencia';
  }
}

// ─── PAYPAL RECEIPT MODAL ────────────────────────────────────────
function showPayPalReceiptModal(result, items, customerInfo, subtotal, tax, total) {
  const fmt = n => new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2
  }).format(n);

  // Use server-returned totals if available, otherwise fall back to JS-computed
  const displaySubtotal = result.subtotal  ?? subtotal;
  const displayTax      = result.tax       ?? tax;
  const displayTotal    = result.total     ?? total;

  const itemRows = items.map(item => `
    <tr>
      <td class="receipt-td">${item.name}</td>
      <td class="receipt-td receipt-td--center">${item.qty}</td>
      <td class="receipt-td receipt-td--right">${fmt(item.price)}</td>
      <td class="receipt-td receipt-td--right">${fmt(item.price * item.qty)}</td>
    </tr>`).join('');

  const emailNote = customerInfo?.email
    ? `<p class="receipt-email-note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
        Hemos enviado una copia a <strong>${customerInfo.email}</strong>
      </p>`
    : '';

  const modal = document.createElement('div');
  modal.className = 'receipt-modal';
  modal.id = 'receipt-modal';
  modal.innerHTML = `
    <div class="receipt-modal__backdrop"></div>
    <div class="receipt-modal__scroll">
      <div class="receipt-modal__content" id="receipt-content">

        <!-- Action bar -->
        <div class="receipt-actions no-print">
          <span class="receipt-actions__label">Comprobante de Pago PayPal</span>
          <div class="receipt-actions__btns">
            <button class="receipt-btn receipt-btn--download" id="receipt-download">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar PDF
            </button>
            <button class="receipt-btn receipt-btn--close" id="receipt-close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Cerrar
            </button>
          </div>
        </div>

        <div class="receipt-body">

          <!-- Letterhead -->
          <div class="receipt-letterhead">
            <div class="receipt-letterhead__brand">BIMXcloud</div>
            <div class="receipt-letterhead__title">Comprobante de Pago — PayPal</div>
          </div>

          <!-- Paid badge -->
          <div class="receipt-order-badge receipt-order-badge--paid">
            <div class="receipt-paid-chip">✓ Pago Confirmado</div>
            <div class="receipt-order-badge__label">Número de Orden</div>
            <div class="receipt-order-badge__num">${result.order_name}</div>
            ${result.paypal_order_id
              ? `<div class="receipt-order-badge__hint">Ref. PayPal: <span style="font-family:var(--font-mono);font-size:11px;">${result.paypal_order_id}</span></div>`
              : ''}
          </div>

          <!-- Customer -->
          <div class="receipt-customer">
            <div class="receipt-customer__name">${customerInfo?.name || ''}</div>
            <div class="receipt-customer__email">${customerInfo?.email || ''}</div>
          </div>

          <!-- Items table -->
          <div class="receipt-section">
            <div class="receipt-section__title">Productos / Servicios</div>
            <table class="receipt-table">
              <thead>
                <tr>
                  <th class="receipt-th">Servicio</th>
                  <th class="receipt-th receipt-th--center">Qty</th>
                  <th class="receipt-th receipt-th--right">Precio</th>
                  <th class="receipt-th receipt-th--right">Importe</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </div>

          <!-- Totals -->
          <div class="receipt-totals">
            <div class="receipt-total-row">
              <span>Subtotal</span><span>${fmt(displaySubtotal)}</span>
            </div>
            <div class="receipt-total-row">
              <span>IVA (16%)</span><span>${fmt(displayTax)}</span>
            </div>
            <div class="receipt-total-row receipt-total-row--final">
              <span>Total Pagado</span><span>${fmt(displayTotal)}</span>
            </div>
          </div>

          <!-- Email note + footer -->
          ${emailNote}
          <div class="receipt-footer">
            Tu pago fue procesado exitosamente. Tu servicio se activará en 1–2 horas hábiles.
          </div>

        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('receipt-modal--visible'));

  document.getElementById('receipt-download').addEventListener('click', () => window.print());

  function closeModal() {
    modal.classList.remove('receipt-modal--visible');
    setTimeout(() => {
      modal.remove();
      showOrderConfirmation(result.order_name, 'paypal');
    }, 250);
  }
  document.getElementById('receipt-close').addEventListener('click', closeModal);
  modal.querySelector('.receipt-modal__backdrop').addEventListener('click', closeModal);
}

// ─── WIRE RECEIPT MODAL ───────────────────────────────────────────
function showWireReceiptModal(result, items, customerInfo, subtotal, tax, total) {
  const fmt = n => new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2
  }).format(n);

  const itemRows = items.map(item => `
    <tr>
      <td class="receipt-td">${item.name}</td>
      <td class="receipt-td receipt-td--center">${item.qty}</td>
      <td class="receipt-td receipt-td--right">${fmt(item.price)}</td>
      <td class="receipt-td receipt-td--right">${fmt(item.price * item.qty)}</td>
    </tr>`).join('');

  const bankFields = [
    ['Banco',           result.bank_name],
    ['Beneficiario',    result.account_holder_name],
    ['No. de Cuenta',   result.account_number],
    ['CLABE / Routing', result.routing_number],
    ['SWIFT / BIC',     result.swift_code],
    ['Dirección',       result.bank_address],
  ].filter(([, v]) => v);

  const bankRows = bankFields.map(([label, value]) => `
    <tr>
      <td class="receipt-bank-label">${label}</td>
      <td class="receipt-bank-value">${value}</td>
    </tr>`).join('');

  const instructionsHtml = result.instructions
    ? `<div class="receipt-instructions">${result.instructions}</div>`
    : '';

  const emailNote = customerInfo.email
    ? `<p class="receipt-email-note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
        Hemos enviado una copia a <strong>${customerInfo.email}</strong>
      </p>`
    : '';

  // Build modal
  const modal = document.createElement('div');
  modal.className = 'receipt-modal';
  modal.id = 'receipt-modal';
  modal.innerHTML = `
    <div class="receipt-modal__backdrop"></div>
    <div class="receipt-modal__scroll">
      <div class="receipt-modal__content" id="receipt-content">

        <!-- Action bar (hidden in print) -->
        <div class="receipt-actions no-print">
          <span class="receipt-actions__label">Tu comprobante de pedido</span>
          <div class="receipt-actions__btns">
            <button class="receipt-btn receipt-btn--download" id="receipt-download">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar PDF
            </button>
            <button class="receipt-btn receipt-btn--close" id="receipt-close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Cerrar
            </button>
          </div>
        </div>

        <!-- Receipt body -->
        <div class="receipt-body">

          <!-- Letterhead -->
          <div class="receipt-letterhead">
            <div class="receipt-letterhead__brand">BIMXcloud</div>
            <div class="receipt-letterhead__title">Orden de Transferencia Bancaria</div>
          </div>

          <!-- Order number badge -->
          <div class="receipt-order-badge">
            <div class="receipt-order-badge__label">Número de Orden · Referencia de Pago</div>
            <div class="receipt-order-badge__num">${result.order_name}</div>
            <div class="receipt-order-badge__hint">Usa este número como referencia al realizar tu transferencia</div>
          </div>

          <!-- Customer block -->
          <div class="receipt-customer">
            <div class="receipt-customer__name">${customerInfo.name}</div>
            <div class="receipt-customer__email">${customerInfo.email}</div>
          </div>

          <!-- Items table -->
          <div class="receipt-section">
            <div class="receipt-section__title">Productos / Servicios</div>
            <table class="receipt-table">
              <thead>
                <tr>
                  <th class="receipt-th">Servicio</th>
                  <th class="receipt-th receipt-th--center">Qty</th>
                  <th class="receipt-th receipt-th--right">Precio</th>
                  <th class="receipt-th receipt-th--right">Importe</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </div>

          <!-- Totals -->
          <div class="receipt-totals">
            <div class="receipt-total-row">
              <span>Subtotal</span><span>${fmt(subtotal)}</span>
            </div>
            <div class="receipt-total-row">
              <span>IVA (16%)</span><span>${fmt(tax)}</span>
            </div>
            <div class="receipt-total-row receipt-total-row--final">
              <span>Total a Pagar</span><span>${fmt(total)}</span>
            </div>
          </div>

          <!-- Bank details -->
          <div class="receipt-section">
            <div class="receipt-section__title">Datos para la Transferencia</div>
            <div class="receipt-bank-box">
              <table class="receipt-bank-table">${bankRows}</table>
              ${instructionsHtml}
            </div>
          </div>

          <!-- Email note + footer -->
          ${emailNote}
          <div class="receipt-footer">
            Conserva este documento como comprobante de pago.<br/>
            Tu servicio se activará en 1–2 horas hábiles tras confirmar la transferencia.
          </div>

        </div><!-- /receipt-body -->
      </div><!-- /receipt-modal__content -->
    </div><!-- /receipt-modal__scroll -->
  `;

  document.body.appendChild(modal);
  // Trigger enter animation next frame
  requestAnimationFrame(() => modal.classList.add('receipt-modal--visible'));

  // Download → browser print dialog (save as PDF)
  document.getElementById('receipt-download').addEventListener('click', () => {
    window.print();
  });

  // Close button / backdrop → dismiss and show static confirmation
  function closeModal() {
    modal.classList.remove('receipt-modal--visible');
    setTimeout(() => {
      modal.remove();
      showOrderConfirmation(result.order_name, 'wire');
    }, 250);
  }
  document.getElementById('receipt-close').addEventListener('click', closeModal);
  modal.querySelector('.receipt-modal__backdrop').addEventListener('click', closeModal);
}

// ─── ORDER CONFIRMATION ───────────────────────────────────────────
function showOrderConfirmation(orderName, method) {
  const layout = document.getElementById('cart-layout');
  const isWire = method === 'wire';

  layout.innerHTML = `
    <div class="order-confirmed">
      <div class="order-confirmed__icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
      </div>
      <h2 class="order-confirmed__title">¡Pedido Registrado!</h2>
      <p class="order-confirmed__sub">Número de orden: <strong>${orderName}</strong></p>
      ${isWire
        ? `<p class="order-confirmed__msg">Realiza tu transferencia con los datos proporcionados. Tu servicio se activará en 1–2 horas hábiles tras confirmar el pago.</p>`
        : `<p class="order-confirmed__msg">Tu pago con PayPal fue procesado exitosamente. Tu servicio se activará en breve.</p>`
      }
      <a href="/store" class="btn btn--primary" style="margin-top:24px;">Volver a la Tienda</a>
    </div>`;
}

// ─── INIT ─────────────────────────────────────────────────────────
(function () {
  window.addEventListener('scroll', () => {
    document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  // Note: hamburger / mobile-menu toggle is handled by store.js (loaded on all pages)

  const loggedIn = window.frappe?.session?.user && frappe.session.user !== 'Guest';
  const authBtn  = document.getElementById('nav-auth-btn');
  const mobBtn   = document.getElementById('mobile-auth-btn');
  if (loggedIn) {
    if (authBtn) { authBtn.textContent = 'Mi Portal'; authBtn.href = '/customer_portal'; }
    if (mobBtn)  { mobBtn.textContent  = 'Mi Portal'; mobBtn.href  = '/customer_portal'; }
  }

  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);

  renderCart();
})();
