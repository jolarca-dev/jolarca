"""Identity models.

AUTH_USER_MODEL is this User (settings.base). Changing it post-launch is a
data migration nightmare — hence UUID PKs and email login from day one.

PII fields live on UserProfile behind EncryptedTextField with RoPA
classification; the User table itself carries only what auth requires.
"""

from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models

from apps.core.encryption import EncryptedTextField
from apps.core.models import TimeStampedModel, UUIDModel


class UserManager(DjangoUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(UUIDModel, AbstractUser):
    username = None  # type: ignore[assignment]  # email-login user
    email = models.EmailField("email address", unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects: ClassVar[UserManager] = UserManager()

    def __str__(self) -> str:
        return self.email


class UserProfile(UUIDModel, TimeStampedModel):
    """Extended personal data — encrypted at rest, RoPA-classified."""

    user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="profile")
    full_name = EncryptedTextField(blank=True, default="", pii_classification="direct_identifier")
    phone = EncryptedTextField(blank=True, default="", pii_classification="contact")
    date_of_birth = EncryptedTextField(
        blank=True, default="", pii_classification="indirect_identifier"
    )
    street_address = EncryptedTextField(blank=True, default="", pii_classification="contact")
    city = models.CharField(max_length=128, blank=True, default="")
    country = models.CharField(max_length=2, blank=True, default="", help_text="ISO 3166-1 alpha-2")
    preferred_language = models.CharField(max_length=8, default="en")


class ConsentPurpose(models.TextChoices):
    MARKETING = "marketing", "Marketing communications"
    ANALYTICS = "analytics", "Usage analytics"
    PERSONALIZATION = "personalization", "Personalized recommendations"
    TRANSACTIONS = "transactions", "Transactional processing (contract)"


class ConsentRecord(UUIDModel, TimeStampedModel):
    """Immutable consent ledger (GDPR Art. 7). Records are never updated —
    a revocation is a NEW row with granted=False."""

    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="consents")
    purpose = models.CharField(max_length=32, choices=ConsentPurpose.choices)
    consent_version = models.CharField(max_length=16, help_text="Policy version consented to")
    granted = models.BooleanField()
    ip_address = models.GenericIPAddressField(null=True)
    user_agent = models.TextField(blank=True, default="")
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "purpose"])]

    def save(self, *args, **kwargs):
        # UUID defaults are assigned at instantiation, so pk is ALWAYS set —
        # _state.adding is the correct insert-vs-update discriminator.
        if not self._state.adding:
            raise ValueError("ConsentRecord is append-only; create a new record instead.")
        super().save(*args, **kwargs)
