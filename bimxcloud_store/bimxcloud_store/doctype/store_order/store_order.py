import frappe
from frappe.model.document import Document


class StoreOrder(Document):
    def before_save(self):
        self.subtotal = sum(
            (item.qty or 0) * (item.rate or 0) for item in self.items
        )
        # Update each item's amount field
        for item in self.items:
            item.amount = (item.qty or 0) * (item.rate or 0)

        tax_rate = (self.tax_rate or 16) / 100
        self.tax_amount = self.subtotal * tax_rate
        self.total = self.subtotal + self.tax_amount
