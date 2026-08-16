"""users_app service layer — the ONLY sanctioned entry points for callers.

Cross-app rule: other apps call these functions; they never import
users_app.models/views/tasks directly.
"""

from __future__ import annotations

import structlog

from apps.core.permissions import Roles

from .models import ConsentPurpose, ConsentRecord, User, UserProfile

audit = structlog.get_logger("jol.audit")


class RegistrationError(Exception):
    pass


def register(
    email: str,
    password: str,
    *,
    language: str = "en",
    ip_address: str | None = None,
    user_agent: str = "",
) -> User:
    """Create a buyer account with profile and the transactional consent record.

    Marketing/analytics consent is NEVER assumed — it must be granted
    explicitly through a separate, recorded action (GDPR Art. 7(1)).
    """
    if User.objects.filter(email__iexact=email).exists():
        raise RegistrationError("An account with this email already exists.")

    user = User.objects.create_user(email=email, password=password)
    UserProfile.objects.create(user=user, preferred_language=language)

    # Contractual basis (Art. 6(1)(b)) — recorded for auditability anyway.
    ConsentRecord.objects.create(
        user=user,
        purpose=ConsentPurpose.TRANSACTIONS,
        consent_version="1.0",
        granted=True,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    from django.contrib.auth.models import Group

    buyer_group, _ = Group.objects.get_or_create(name=Roles.BUYER)
    user.groups.add(buyer_group)

    from .tasks import send_welcome_email

    send_welcome_email.delay(str(user.pk))
    audit.info("user_registered", user_id=str(user.pk))
    return user


def enable_totp(user: User) -> None:
    """Sanctioned stub — tracked in docs/MVP_REMAINING_WORK.md (MVP-U2).

    Implement with pyotp + backup codes; must record an audit event and
    require re-authentication before enabling.
    """
    raise NotImplementedError("MVP-U2: TOTP enrollment not yet implemented")


def erase_user_data(user: User) -> None:
    """Entry point for GDPR Art. 17 erasure — delegates to compliance_app,
    which owns the fan-out orchestration and SLA tracking."""
    from apps.compliance_app.services import request_erasure

    request_erasure(user)
