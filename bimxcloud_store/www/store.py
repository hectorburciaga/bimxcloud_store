"""
www/store.py — Context controller for the BIMXcloud store page.
Loads published Store Items from the custom Store Item doctype.
"""

import frappe


def get_context(context):
    context.no_cache = 1
    context.parents = [{"title": "Inicio", "route": "/landing"}]

    try:
        store_items = frappe.get_all(
            "Store Item",
            filters={"published": 1},
            fields=[
                "item as item_code",
                "item_name",
                "item_group",
                "price",
                "currency",
                "short_description as description",
                "website_image",
                "ranking",
            ],
            order_by="ranking asc, item_name asc",
        )

        context.products = [
            {
                "item_code":     item.item_code,
                "item_name":     item.item_name or item.item_code,
                "price":         item.price or 0,
                "currency":      item.currency or "MXN",
                "description":   item.description or "",
                "website_image": item.website_image or "",
                "category":      item.item_group or "",
            }
            for item in store_items
        ]

    except Exception:
        frappe.log_error(frappe.get_traceback(), "BIMXcloud Store: failed to load Store Items")
        context.products = []
