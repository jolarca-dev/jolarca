"""EU VAT domain: rate snapshots, OSS data, commercial invoices.

Stripe Tax API calls go through payments_app (single Stripe boundary);
this app owns the tax DATA and rules so invoices survive any payment
provider change.
"""
