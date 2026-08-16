"""RBAC primitives.

Roles are Django groups — no custom permission tables until a proven need.
Object-level permissions (seller owns listing X) are enforced in services
via explicit ownership checks, keeping authorization logic auditable in one
place per app.
"""

from __future__ import annotations

from rest_framework.permissions import BasePermission


class Roles:
    BUYER = "buyer"
    SELLER = "seller"
    SUPPORT = "support"
    ADMIN = "admin"

    ALL = (BUYER, SELLER, SUPPORT, ADMIN)


def ensure_role_groups() -> None:
    """Idempotent role-group bootstrap (called from data migration/seed)."""
    from django.contrib.auth.models import Group

    for role in Roles.ALL:
        Group.objects.get_or_create(name=role)


def has_role(user, role: str) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if role == Roles.ADMIN and user.is_superuser:
        return True
    return user.groups.filter(name=role).exists()


class HasRole(BasePermission):
    """DRF permission: `permission_classes = [HasRole]` + `role = Roles.SELLER`."""

    role: str = Roles.BUYER

    def has_permission(self, request, view) -> bool:
        role = getattr(view, "role", self.role)
        return has_role(request.user, role)
