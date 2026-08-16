"""GDPR compliance: erasure fan-out, portability exports, retention, audit.

This app ORCHESTRATES erasure; each domain app registers a handler that
knows how to erase/anonymize ITS OWN data. That keeps deletion logic next
to the data model it protects — the only place it can be maintained safely.
"""
