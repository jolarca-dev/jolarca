"""Payments — the ONLY module permitted to import the Stripe SDK.

Boundary rule (ADR-0001): no other app may `import stripe`. Tax
calculations that need Stripe Tax are exposed from here as services
consumed by tax_app.
"""
