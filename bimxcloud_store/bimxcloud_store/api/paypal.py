"""
api/paypal.py — Native PayPal Orders API v2 integration.

Endpoints (all whitelisted for guest access — auth enforced manually):
  POST  bimxcloud_store.bimxcloud_store.api.paypal.create_order
  POST  bimxcloud_store.bimxcloud_store.api.paypal.capture_order
  POST  bimxcloud_store.bimxcloud_store.api.paypal.wire_transfer_order
"""

import json
from base64 import b64encode

import frappe
import requests


TAX_RATE = 0.16  # 16% IVA


# ─── HELPERS ──────────────────────────────────────────────────────

def _settings():
    return frappe.get_single("BIMXcloud Store Settings")


def _base_url(settings):
    if settings.sandbox_mode:
        return "https://api-m.sandbox.paypal.com"
    return "https://api-m.paypal.com"


def _get_access_token(settings):
    """Obtain a short-lived Bearer token via OAuth2 client credentials."""
    client_id = settings.paypal_client_id
    client_secret = settings.get_password("paypal_client_secret")

    if not client_id or not client_secret:
        frappe.throw("PayPal credentials are not configured in BIMXcloud Store Settings.")

    credentials = b64encode(f"{client_id}:{client_secret}".encode()).decode()
    response = requests.post(
        f"{_base_url(settings)}/v1/oauth2/token",
        headers={
            "Accept": "application/json",
            "Accept-Language": "en_US",
            "Authorization": f"Basic {credentials}",
        },
        data={"grant_type": "client_credentials"},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def _resolve_cart(cart_items):
    """
    Validate cart items against Store Item doctype and return enriched list.
    cart_items: [{"item_code": str, "qty": int}]
    Returns: [{"item_code", "item_name", "qty", "rate"}]
    """
    if not cart_items:
        frappe.throw("Cart is empty.")

    item_codes = [i["item_code"] for i in cart_items]
    store_items = frappe.get_all(
        "Store Item",
        filters={"item": ["in", item_codes], "published": 1},
        fields=["item as item_code", "item_name", "price as rate", "currency"],
    )
    rate_map = {si["item_code"]: si for si in store_items}

    resolved = []
    for ci in cart_items:
        code = ci["item_code"]
        if code not in rate_map:
            frappe.throw(f"Item '{code}' is not available in the store.")
        si = rate_map[code]
        resolved.append({
            "item_code": code,
            "item_name": si["item_name"] or code,
            "qty": max(1, int(ci.get("qty", 1))),
            "rate": float(si["rate"]),
        })
    return resolved


def _compute_totals(resolved_items):
    subtotal = sum(i["qty"] * i["rate"] for i in resolved_items)
    tax = round(subtotal * TAX_RATE, 2)
    total = round(subtotal + tax, 2)
    subtotal = round(subtotal, 2)
    return subtotal, tax, total


# ─── WHITELISTED ENDPOINTS ────────────────────────────────────────

@frappe.whitelist(allow_guest=True)
def create_order(cart_items):
    """
    Create a PayPal Order and return its ID to the frontend.
    The frontend PayPal SDK uses this ID to open the PayPal popup.
    """
    if isinstance(cart_items, str):
        cart_items = json.loads(cart_items)

    settings = _settings()
    if not settings.paypal_client_id:
        frappe.throw("PayPal is not configured.")

    resolved = _resolve_cart(cart_items)
    subtotal, tax, total = _compute_totals(resolved)

    currency = resolved[0].get("currency", "MXN") if resolved else "MXN"
    # PayPal requires currency code — use USD if currency is MXN and sandbox
    # (PayPal MXN support depends on merchant account country; keep as-is for live)
    access_token = _get_access_token(settings)

    paypal_items = [
        {
            "name": item["item_name"][:127],  # PayPal max 127 chars
            "sku": item["item_code"],
            "unit_amount": {
                "currency_code": currency,
                "value": f"{item['rate']:.2f}",
            },
            "quantity": str(item["qty"]),
        }
        for item in resolved
    ]

    order_body = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "amount": {
                    "currency_code": currency,
                    "value": f"{total:.2f}",
                    "breakdown": {
                        "item_total": {
                            "currency_code": currency,
                            "value": f"{subtotal:.2f}",
                        },
                        "tax_total": {
                            "currency_code": currency,
                            "value": f"{tax:.2f}",
                        },
                    },
                },
                "items": paypal_items,
            }
        ],
    }

    response = requests.post(
        f"{_base_url(settings)}/v2/checkout/orders",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json=order_body,
        timeout=15,
    )
    response.raise_for_status()
    order = response.json()
    return {"id": order["id"]}


@frappe.whitelist(allow_guest=True)
def capture_order(paypal_order_id, cart_items, customer_name, customer_email):
    """
    Capture an approved PayPal order and record a Store Order doc.
    """
    if isinstance(cart_items, str):
        cart_items = json.loads(cart_items)

    if not paypal_order_id:
        frappe.throw("Missing PayPal order ID.")

    settings = _settings()
    access_token = _get_access_token(settings)

    response = requests.post(
        f"{_base_url(settings)}/v2/checkout/orders/{paypal_order_id}/capture",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={},
        timeout=15,
    )
    response.raise_for_status()
    capture_data = response.json()

    capture_status = capture_data.get("status")
    if capture_status != "COMPLETED":
        frappe.throw(f"PayPal capture not completed. Status: {capture_status}")

    resolved = _resolve_cart(cart_items)
    subtotal, tax, total = _compute_totals(resolved)

    order = frappe.new_doc("Store Order")
    order.customer_name = customer_name or "Guest"
    order.customer_email = customer_email or ""
    order.payment_method = "PayPal"
    order.status = "Paid"
    order.paypal_order_id = paypal_order_id
    order.currency = resolved[0].get("currency", "MXN") if resolved else "MXN"
    order.tax_rate = TAX_RATE * 100

    for item in resolved:
        order.append("items", {
            "item_code": item["item_code"],
            "item_name": item["item_name"],
            "qty": item["qty"],
            "rate": item["rate"],
            "amount": item["qty"] * item["rate"],
        })

    order.insert(ignore_permissions=True)
    order.save(ignore_permissions=True)

    # Send confirmation email to the customer
    if order.customer_email:
        try:
            _send_paypal_confirmation_email(order, subtotal, tax, total)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "PayPal Confirmation Email Failed")

    return {
        "order_name":      order.name,
        "status":          "Paid",
        "subtotal":        subtotal,
        "tax":             tax,
        "total":           total,
        "paypal_order_id": paypal_order_id,
    }


def _send_paypal_confirmation_email(order, subtotal, tax, total):
    """Build and send an HTML order confirmation email for a PayPal payment."""
    currency = order.currency or "MXN"

    def fmt(n):
        return f"${n:,.2f} {currency}"

    items_rows = "".join(
        f"""<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;color:#1a2b3c;">{item.item_name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;text-align:center;color:#1a2b3c;">{item.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;text-align:right;color:#1a2b3c;">{fmt(item.rate)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;text-align:right;font-weight:600;color:#0055cc;">{fmt(item.amount)}</td>
        </tr>"""
        for item in order.items
    )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#1a2b3c;">
  <div style="max-width:620px;margin:32px auto;background:#ffffff;border-radius:12px;
              box-shadow:0 2px 16px rgba(0,0,0,.08);overflow:hidden;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#003087,#009cde);padding:32px 32px 24px;text-align:center;">
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-.3px;">BIMXcloud</h1>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,.75);">Confirmación de Pago — PayPal</p>
    </div>

    <div style="padding:32px;">

      <!-- Paid badge -->
      <div style="background:#edfaf3;border:1px solid #86e0b4;border-radius:10px;
                  padding:20px 24px;margin-bottom:28px;text-align:center;">
        <div style="display:inline-block;padding:4px 14px;background:#00c170;border-radius:20px;
                    font-size:11px;font-weight:700;color:#fff;letter-spacing:.08em;
                    text-transform:uppercase;margin-bottom:10px;">✓ Pago Confirmado</div>
        <p style="margin:0 0 6px;font-size:11px;color:#667799;text-transform:uppercase;
                  letter-spacing:.1em;">Número de Orden</p>
        <p style="margin:0 0 4px;font-size:28px;font-weight:800;color:#0033aa;
                  font-family:monospace;letter-spacing:.04em;">{order.name}</p>
        <p style="margin:0;font-size:11.5px;color:#667799;">
          Ref. PayPal: <span style="font-family:monospace;">{order.paypal_order_id}</span>
        </p>
      </div>

      <!-- Customer -->
      <p style="margin:0 0 6px;font-size:14px;color:#667799;">Pedido para:</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1a2b3c;">{order.customer_name}</p>
      <p style="margin:0 0 28px;font-size:13px;color:#667799;">{order.customer_email}</p>

      <!-- Items -->
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#667799;
                text-transform:uppercase;letter-spacing:.08em;">Productos / Servicios</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e8edf4;
                    border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#f4f7fb;">
            <th style="padding:10px 12px;font-size:11px;text-align:left;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Servicio</th>
            <th style="padding:10px 12px;font-size:11px;text-align:center;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Qty</th>
            <th style="padding:10px 12px;font-size:11px;text-align:right;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Precio</th>
            <th style="padding:10px 12px;font-size:11px;text-align:right;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Importe</th>
          </tr>
        </thead>
        <tbody>{items_rows}</tbody>
      </table>

      <!-- Totals -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#667799;">Subtotal</td>
          <td style="padding:6px 0;font-size:13px;color:#1a2b3c;text-align:right;">{fmt(subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#667799;
                     border-bottom:1px solid #e8edf4;padding-bottom:12px;">IVA (16%)</td>
          <td style="padding:6px 0;font-size:13px;color:#1a2b3c;text-align:right;
                     border-bottom:1px solid #e8edf4;padding-bottom:12px;">{fmt(tax)}</td>
        </tr>
        <tr>
          <td style="padding:14px 0 6px;font-size:17px;font-weight:800;color:#1a2b3c;">Total Pagado</td>
          <td style="padding:14px 0 6px;font-size:20px;font-weight:800;color:#0033aa;text-align:right;">{fmt(total)}</td>
        </tr>
      </table>

      <!-- Footer note -->
      <p style="margin:0;font-size:11.5px;color:#99aabb;text-align:center;line-height:1.7;">
        Tu pago fue procesado exitosamente vía PayPal.<br/>
        Tu servicio se activará en <strong style="color:#667799;">1–2 horas hábiles</strong>.
      </p>

    </div>
  </div>
</body>
</html>"""

    frappe.sendmail(
        recipients=[order.customer_email],
        subject=f"Confirmación de Pago {order.name} — BIMXcloud",
        message=html,
        now=True,
    )


@frappe.whitelist(allow_guest=True)
def wire_transfer_order(cart_items, customer_name, customer_email, notes=""):
    """
    Record a pending Store Order for wire transfer payment.
    Returns order details + bank transfer instructions.
    """
    if isinstance(cart_items, str):
        cart_items = json.loads(cart_items)

    resolved = _resolve_cart(cart_items)
    subtotal, tax, total = _compute_totals(resolved)

    order = frappe.new_doc("Store Order")
    order.customer_name = customer_name or "Guest"
    order.customer_email = customer_email or ""
    order.payment_method = "Wire Transfer"
    order.status = "Pending"
    order.currency = resolved[0].get("currency", "MXN") if resolved else "MXN"
    order.tax_rate = TAX_RATE * 100
    order.notes = notes

    for item in resolved:
        order.append("items", {
            "item_code": item["item_code"],
            "item_name": item["item_name"],
            "qty": item["qty"],
            "rate": item["rate"],
            "amount": item["qty"] * item["rate"],
        })

    order.insert(ignore_permissions=True)
    order.save(ignore_permissions=True)

    settings = _settings()

    # Send confirmation email to the customer
    if order.customer_email:
        try:
            _send_wire_confirmation_email(order, settings, subtotal, tax, total)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Wire Transfer Email Failed")

    return {
        "order_name": order.name,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "status": "Pending",
        "bank_name": settings.bank_name,
        "account_holder_name": settings.account_holder_name,
        "account_number": settings.account_number,
        "routing_number": settings.routing_number,
        "swift_code": settings.swift_code,
        "bank_address": settings.bank_address,
        "instructions": settings.wire_transfer_instructions or "",
    }


def _send_wire_confirmation_email(order, settings, subtotal, tax, total):
    """Build and send an HTML order confirmation email for wire transfer."""
    currency = order.currency or "MXN"

    def fmt(n):
        return f"${n:,.2f} {currency}"

    # Items rows
    items_rows = "".join(
        f"""<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;color:#1a2b3c;">{item.item_name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;text-align:center;color:#1a2b3c;">{item.qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;text-align:right;color:#1a2b3c;">{fmt(item.rate)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8edf4;font-size:13px;text-align:right;font-weight:600;color:#0055cc;">{fmt(item.amount)}</td>
        </tr>"""
        for item in order.items
    )

    # Bank detail rows
    bank_fields = [
        ("Banco",            settings.bank_name),
        ("Beneficiario",     settings.account_holder_name),
        ("No. de Cuenta",    settings.account_number),
        ("CLABE / Routing",  settings.routing_number),
        ("SWIFT / BIC",      settings.swift_code),
        ("Dirección",        settings.bank_address),
    ]
    bank_rows = "".join(
        f"""<tr>
          <td style="padding:6px 12px;font-size:12px;color:#667788;white-space:nowrap;vertical-align:top;">{label}</td>
          <td style="padding:6px 12px;font-size:12px;font-family:monospace;color:#1a2b3c;word-break:break-all;">{value}</td>
        </tr>"""
        for label, value in bank_fields if value
    )

    instructions_html = (
        f"""<p style="margin:16px 0 0;padding:12px 16px;background:#f0f4ff;border-left:3px solid #0055cc;
                border-radius:0 6px 6px 0;font-size:12px;color:#445566;line-height:1.7;">
          {settings.wire_transfer_instructions}
        </p>"""
        if settings.wire_transfer_instructions else ""
    )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#1a2b3c;">
  <div style="max-width:620px;margin:32px auto;background:#ffffff;border-radius:12px;
              box-shadow:0 2px 16px rgba(0,0,0,.08);overflow:hidden;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0033aa,#0077ff);padding:32px 32px 24px;text-align:center;">
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-.3px;">BIMXcloud</h1>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,.75);">Confirmación de Pedido — Transferencia Bancaria</p>
    </div>

    <div style="padding:32px;">

      <!-- Order badge -->
      <div style="background:#f0f4ff;border:1px solid #c8d8f0;border-radius:10px;
                  padding:20px 24px;margin-bottom:28px;text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;color:#667799;text-transform:uppercase;
                  letter-spacing:.1em;">Número de Orden / Referencia de Pago</p>
        <p style="margin:0 0 6px;font-size:30px;font-weight:800;color:#0033aa;
                  font-family:monospace;letter-spacing:.04em;">{order.name}</p>
        <p style="margin:0;font-size:12px;color:#667799;">
          Usa este número como referencia al realizar tu transferencia
        </p>
      </div>

      <!-- Customer -->
      <p style="margin:0 0 6px;font-size:14px;color:#667799;">Pedido para:</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1a2b3c;">{order.customer_name}</p>
      <p style="margin:0 0 28px;font-size:13px;color:#667799;">{order.customer_email}</p>

      <!-- Items -->
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#667799;
                text-transform:uppercase;letter-spacing:.08em;">Productos / Servicios</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e8edf4;
                    border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#f4f7fb;">
            <th style="padding:10px 12px;font-size:11px;text-align:left;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Servicio</th>
            <th style="padding:10px 12px;font-size:11px;text-align:center;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Qty</th>
            <th style="padding:10px 12px;font-size:11px;text-align:right;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Precio</th>
            <th style="padding:10px 12px;font-size:11px;text-align:right;color:#667799;
                        text-transform:uppercase;letter-spacing:.06em;font-weight:700;">Importe</th>
          </tr>
        </thead>
        <tbody>{items_rows}</tbody>
      </table>

      <!-- Totals -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#667799;">Subtotal</td>
          <td style="padding:6px 0;font-size:13px;color:#1a2b3c;text-align:right;">{fmt(subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#667799;
                     border-bottom:1px solid #e8edf4;padding-bottom:12px;">IVA (16%)</td>
          <td style="padding:6px 0;font-size:13px;color:#1a2b3c;text-align:right;
                     border-bottom:1px solid #e8edf4;padding-bottom:12px;">{fmt(tax)}</td>
        </tr>
        <tr>
          <td style="padding:14px 0 6px;font-size:17px;font-weight:800;color:#1a2b3c;">Total a Pagar</td>
          <td style="padding:14px 0 6px;font-size:20px;font-weight:800;color:#0033aa;text-align:right;">{fmt(total)}</td>
        </tr>
      </table>

      <!-- Bank details -->
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#667799;
                text-transform:uppercase;letter-spacing:.08em;">Datos para la Transferencia</p>
      <div style="background:#f8fafd;border:1px solid #dce8f8;border-radius:8px;
                  padding:4px 0;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          {bank_rows}
        </table>
        {instructions_html}
      </div>

      <!-- Footer note -->
      <p style="margin:0;font-size:11.5px;color:#99aabb;text-align:center;line-height:1.7;">
        Este correo es una confirmación automática de tu pedido.<br/>
        Tu servicio se activará en <strong style="color:#667799;">1–2 horas hábiles</strong>
        tras confirmar el pago.
      </p>

    </div><!-- /padding -->
  </div><!-- /card -->
</body>
</html>"""

    frappe.sendmail(
        recipients=[order.customer_email],
        subject=f"Confirmación de Pedido {order.name} — BIMXcloud",
        message=html,
        now=True,
    )
