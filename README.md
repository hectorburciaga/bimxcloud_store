# BIMXcloud Store

E-commerce frontend for [bimxcloud.com](https://bimxcloud.com) built as a Frappe app on top of [Frappe Webshop](https://github.com/frappe/webshop).

## Features

- Dark neotech UI (Syne + DM Sans, cyan/blue accent palette)
- Product grid with category filters + price sorting
- Quick-view modal per product
- LocalStorage cart synced to Frappe Webshop cart API
- PayPal checkout via Frappe's native Payment Gateway
- All pages (Store, Cart) publicly accessible — checkout redirects to login
- Customer Portal link visible to logged-in Customers only

## App structure

```
bimxcloud_store/
├── hooks.py               ← portal menu, route aliases
├── public/
│   ├── css/
│   │   ├── store.css      ← full design system + product cards
│   │   └── cart.css       ← cart page styles
│   └── js/
│       ├── store.js       ← product grid, filters, modal, cart logic
│       └── cart.js        ← cart rendering + Frappe/PayPal checkout
└── www/
    ├── store.html          ← /store page
    ├── store.py            ← Frappe context controller (live products)
    ├── cart.html           ← /cart page
    └── cart.py             ← Frappe context controller (live cart)
```

## Installation

### Prerequisites

```bash
# Make sure webshop is installed
bench get-app webshop https://github.com/frappe/webshop
bench --site bimxcloud.com install-app webshop
```

### Install this app

```bash
# Option A: from GitHub (after pushing)
bench get-app bimxcloud_store https://github.com/hectorburciaga/bimxcloud_store
bench --site bimxcloud.com install-app bimxcloud_store

# Option B: local development
cd frappe-bench/apps
cp -r /path/to/bimxcloud_store .
bench --site bimxcloud.com install-app bimxcloud_store
```

### Build assets

```bash
bench build --app bimxcloud_store
bench --site bimxcloud.com clear-cache
```

## Configuration

### 1. Webshop Settings (ERPNext Desk)

| Field | Value |
|---|---|
| Enable Shopping Cart | ✓ |
| Price List | Standard Selling |
| Default Customer Group | Individual |
| Payment Gateway Account | PayPal |
| Shipment | (leave empty — services only) |

### 2. PayPal Payment Gateway

Go to **ERPNext Desk → Payment Gateway → New**:

| Field | Value |
|---|---|
| Gateway | PayPal |
| Client ID | Your PayPal Client ID |
| Client Secret | Your PayPal Secret |
| Mode | Live (or Sandbox for testing) |

Then create a **Payment Gateway Account** linking it to a GL account.

### 3. Item Configuration

For each product in ERPNext Desk → Item:

- **Published on Website**: ✓
- **Website Price**: set per-item or via Price List
- **Custom Field `custom_category`**: `bim` | `erp` | `storage`
  - Add this field via **Customize Form → Item**

### 4. Navigation

The portal menu defined in `hooks.py` adds these links for all users:

| Page | Route | Visible to |
|---|---|---|
| Inicio | /landing | Everyone |
| Tienda | /store | Everyone |
| Carrito | /cart | Everyone |
| Portal | /customer_portal | Customers only |

## Customization

### Adding products to the JS fallback

If Webshop API is unavailable, `store.js` uses the `PRODUCTS` array as static data. Edit it to match your actual items.

### Changing colors / fonts

All design tokens are CSS variables at the top of `store.css`:

```css
:root {
  --c-brand:  #00d9ff;  /* primary cyan */
  --c-brand2: #0077ff;  /* secondary blue */
  --c-accent: #7b61ff;  /* purple accent */
  /* ... */
}
```

### PayPal in sandbox mode

Set `Mode: Sandbox` in the Payment Gateway doctype and use PayPal sandbox credentials for testing before going live.
