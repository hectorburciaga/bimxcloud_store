"""
www/cart.py — Context controller for the BIMXcloud cart page.
Injects PayPal client ID and wire transfer details for the checkout UI.
"""

import frappe


def get_context(context):
    context.no_cache = 1
    context.parents = [
        {"title": "Inicio", "route": "/landing"},
        {"title": "Tienda", "route": "/store"},
    ]

    try:
        settings = frappe.get_single("BIMXcloud Store Settings")
        context.paypal_client_id  = settings.paypal_client_id or ""
        context.paypal_sandbox    = bool(settings.sandbox_mode)
        context.wire_bank_name    = settings.bank_name or ""
        context.wire_account_name = settings.account_holder_name or ""
        context.wire_account_no   = settings.account_number or ""
        context.wire_routing      = settings.routing_number or ""
        context.wire_swift        = settings.swift_code or ""
        context.wire_address      = settings.bank_address or ""
        context.wire_instructions = settings.wire_transfer_instructions or ""
    except Exception:
        frappe.log_error(frappe.get_traceback(), "BIMXcloud Store: failed to load Store Settings")
        context.paypal_client_id  = ""
        context.paypal_sandbox    = True
        context.wire_bank_name    = ""
        context.wire_account_name = ""
        context.wire_account_no   = ""
        context.wire_routing      = ""
        context.wire_swift        = ""
        context.wire_address      = ""
        context.wire_instructions = ""
