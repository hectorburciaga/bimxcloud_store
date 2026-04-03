from __future__ import unicode_literals

app_name        = "bimxcloud_store"
app_title       = "BIMXcloud Store"
app_publisher   = "BIMXcloud"
app_description = "BIMXcloud e-commerce store with native PayPal and wire transfer checkout"
app_email       = "soporte@bimxcloud.com"
app_license     = "MIT"

# ─── CSS / JS bundled into all web pages ──────────────────────────
# store.css and cart.css are page-specific and loaded via <link> in
# their respective HTML templates — no need to include them globally.

# ─── PORTAL MENU ──────────────────────────────────────────────────
# Visible to all roles (empty role = Guest + all logged-in users).
# "Portal" route is restricted to Customers in get_context.
portal_menu_items = [
    {"title": "Inicio",  "route": "/landing",        "reference_doctype": "", "role": ""},
    {"title": "Tienda",  "route": "/store",           "reference_doctype": "", "role": ""},
    {"title": "Carrito", "route": "/cart",            "reference_doctype": "", "role": ""},
    {"title": "Portal",  "route": "/customer_portal", "reference_doctype": "", "role": "Customer"},
]

# ─── ROUTE ALIASES ────────────────────────────────────────────────
# Redirect legacy /all-products to our new custom /store page
website_route_rules = [
    {"from_route": "/all-products", "to_route": "/store"},
    {"from_route": "/shop",         "to_route": "/store"},
]

# ─── WEBSHOP SETTINGS (apply after installing webshop app) ────────
#
# 1. bench get-app webshop
#    bench --site bimxcloud.com install-app webshop
#
# 2. In ERPNext Desk → Webshop Settings:
#    - Enable Shopping Cart: ✓
#    - Price List: Standard Selling
#    - Default Customer Group: Individual (or create "Portal Customer")
#    - Payment Gateway: PayPal  ← configure separately (see below)
#    - Shipment: leave empty (services, no physical shipping)
#
# 3. In ERPNext Desk → Payment Gateway → New:
#    - Gateway: PayPal
#    - Client ID: <your PayPal client ID>
#    - Client Secret: <your PayPal secret>
#    - Mode: Live (or Sandbox for testing)
#
# 4. In ERPNext Desk → Item (for each product):
#    - Published on Website: ✓
#    - Add custom field "custom_category": bim | erp | storage
#    - Set Website Price (price_list_rate)
#
# 5. bench build --app bimxcloud_store
#    bench --site bimxcloud.com clear-cache
