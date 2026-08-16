"""Shared primitives ONLY: base models, encryption, idempotency, permissions.

Rule: this app contains no business logic and imports no other domain app.
If a helper needs domain knowledge, it belongs in that domain's services.py.
"""
