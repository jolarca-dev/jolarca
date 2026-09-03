"""Base settings — secure defaults shared by every environment.

Environment modules (dev/test/production) import this and then *prove* their
own posture: dev loosens with warnings, production hardens and refuses
fallbacks. Nothing security-relevant may be relaxed silently.
"""

from datetime import timedelta
from pathlib import Path

from celery.schedules import crontab

from project.observability import setup_observability

from .env import env_bool, env_int, env_list, env_str, parse_database_url

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/

DJANGO_ENV = env_str("DJANGO_ENV", "dev") or "dev"

# SECRET_KEY is read here but ENFORCED by each environment module:
# production refuses to boot without a strong key; dev/test use labeled keys.
SECRET_KEY = env_str("DJANGO_SECRET_KEY", "") or ""
DEBUG = env_bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", default=("localhost", "127.0.0.1"))

# --------------------------------------------------------------------------
# Applications
# --------------------------------------------------------------------------
INSTALLED_APPS = [
    # Custom AdminConfig: registers modeltranslation fields before admin
    # autodiscovery (TranslationAdmin requires registered models).
    "project.admin_apps.JOLAdminConfig",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",  # PostGIS; requires GDAL on host/in image (make sysdeps)
    # Third-party
    "rest_framework",
    "drf_spectacular",
    "axes",
    "corsheaders",
    "modeltranslation",
    # Domain apps — cross-app access is via services.py only (ADR-0001 rule 2)
    "apps.core",
    "apps.users_app",
    "apps.sellers_app",
    "apps.products_app",
    "apps.orders_app",
    "apps.payments_app",
    "apps.tax_app",
    "apps.search_app",
    "apps.shipping_app",
    "apps.ai_service_app",
    "apps.bitrix24_integration_app",
    "apps.compliance_app",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "project.middleware.csp.ContentSecurityPolicyMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # GDPR gate runs after auth so it can audit the acting principal.
    "project.middleware.gdpr_middleware.JOLGDPRComplianceMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "axes.middleware.AxesMiddleware",  # must remain last
]

ROOT_URLCONF = "project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "project.wsgi.application"

# --------------------------------------------------------------------------
# Database — PostGIS backend. DATABASE_URL wins over POSTGRES_* fragments.
# --------------------------------------------------------------------------
_database_url = env_str("DATABASE_URL")
if _database_url:
    _db = parse_database_url(_database_url)
else:
    _db = {
        "NAME": env_str("POSTGRES_DB", "jolarca"),
        "USER": env_str("POSTGRES_USER", "jolarca"),
        "PASSWORD": env_str("POSTGRES_PASSWORD", ""),
        "HOST": env_str("POSTGRES_HOST", "localhost"),
        "PORT": env_str("POSTGRES_PORT", "5432"),
    }

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "CONN_MAX_AGE": env_int("DB_CONN_MAX_AGE", 60),
        **_db,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
AUTH_USER_MODEL = "users_app.User"

AUTHENTICATION_BACKENDS = [
    # AxesStandaloneBackend enforces lockouts; ModelBackend performs authentication.
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Brute-force protection (SOC 2 CC6.1 logical access).
AXES_ENABLED = env_bool("AXES_ENABLED", default=True)
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=15)
AXES_LOCK_OUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True
AXES_HANDLER = "axes.handlers.cache.AxesCacheHandler"

# --------------------------------------------------------------------------
# REST API
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {"anon": "60/min", "user": "300/min"},
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.core.exception_handler.custom_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "JOL Marketplace API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/v1",
}

CORS_ALLOWED_ORIGINS = env_list("DJANGO_CORS_ORIGINS", default=("http://localhost:3000",))
CORS_ALLOW_CREDENTIALS = True
# The money path sends Idempotency-Key cross-origin; without it here the
# browser blocks the order-creation POST at preflight (never reaches Django).
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-language",
    "content-language",
    "content-type",
    "authorization",
    "idempotency-key",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# --------------------------------------------------------------------------
# Security defaults (hardened further in production.py)
# --------------------------------------------------------------------------
# Cookie names align with the frontend auth gate (src/i18n/config.ts).
# Production upgrades both to the __Host- prefix (see production.py).
SESSION_COOKIE_NAME = "jol_session"
CSRF_COOKIE_NAME = "jol_csrf"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_PATH = "/"
CSRF_COOKIE_PATH = "/"
# NOTE: the CSRF cookie must stay JS-readable (double-submit pattern) —
# the HttpOnly exception is documented in docs/SECURITY.md; the token
# itself is what protects mutations.
SESSION_COOKIE_SAMESITE = "Lax"  # dev-friendly; production hardens to Strict
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = 0  # production sets 2y + preload

# Content-Security-Policy for Django-served surfaces (admin, schema UI).
CSP_POLICY = {
    "default-src": ("'self'",),
    "script-src": ("'self'",),
    "style-src": ("'self'", "'unsafe-inline'"),
    "img-src": ("'self'", "data:", "https:"),
    "connect-src": ("'self'",),
    "frame-ancestors": ("'none'",),
    "base-uri": ("'self'",),
    "form-action": ("'self'",),
}

# --------------------------------------------------------------------------
# Caches
# --------------------------------------------------------------------------
_redis_url = env_str("REDIS_URL", "redis://localhost:6379/0")
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": _redis_url,
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}

# --------------------------------------------------------------------------
# Static / media
# --------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

_s3_endpoint = env_str("AWS_S3_ENDPOINT_URL")
AWS_ACCESS_KEY_ID = env_str("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = env_str("AWS_SECRET_ACCESS_KEY", "")
AWS_STORAGE_BUCKET_NAME = env_str("AWS_S3_BUCKET", "jolarca-media")
AWS_S3_ENDPOINT_URL = _s3_endpoint
AWS_QUERYSTRING_AUTH = True  # signed URLs by default: media is not public
if _s3_endpoint:
    STORAGES["default"] = {"BACKEND": "storages.backends.s3boto3.S3Boto3Storage"}
else:
    MEDIA_ROOT = BASE_DIR / "media"
    STORAGES["default"] = {"BACKEND": "django.core.files.storage.FileSystemStorage"}

# --------------------------------------------------------------------------
# I18N — UI locales: lt/lv/et/en. Catalog content translation is separate
# (django-modeltranslation) — see ADR-0003.
# --------------------------------------------------------------------------
LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
LANGUAGES = [("lt", "Lietuvių"), ("lv", "Latviešu"), ("et", "Eesti"), ("en", "English")]
MODELTRANSLATION_DEFAULT_LANGUAGE = "en"

# --------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------
EMAIL_HOST = env_str("EMAIL_HOST", "localhost")
EMAIL_PORT = env_int("EMAIL_PORT", 1025)
DEFAULT_FROM_EMAIL = "journey4oflife+jolarca.dev@gmail.com"

# --------------------------------------------------------------------------
# Celery — reliability settings for marketplace money paths
# --------------------------------------------------------------------------
CELERY_BROKER_URL = env_str("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = None  # outbox pattern over result backend (fewer moving parts)
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = "UTC"
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_MAX_TASKS_PER_CHILD = 200
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TASK_DEFAULT_QUEUE = "default"

CELERY_TASK_ROUTES = {
    "apps.users_app.tasks.*": {"queue": "email"},
    "apps.products_app.tasks.resize_*": {"queue": "media"},
    "apps.ai_service_app.tasks.*": {"queue": "ai"},
    "apps.compliance_app.tasks.*": {"queue": "compliance"},
}

CELERY_BEAT_SCHEDULE = {
    "orders-sweep-unpaid": {
        "task": "apps.orders_app.tasks.sweep_unpaid_orders",
        "schedule": timedelta(minutes=10),
    },
    "compliance-retention-sweep": {
        "task": "apps.compliance_app.tasks.nightly_retention_sweep",
        "schedule": crontab(hour=2, minute=30),
    },
    "compliance-erasure-sla": {
        "task": "apps.compliance_app.tasks.check_erasure_sla",
        "schedule": timedelta(hours=1),
    },
    "tax-isaf-monthly-export": {
        "task": "apps.tax_app.tasks.monthly_isaf_export",
        "schedule": crontab(day_of_month=1, hour=6, minute=0),
    },
}

# --------------------------------------------------------------------------
# GDPR / data-protection controls (see .env.example for semantics)
# --------------------------------------------------------------------------
GDPR_PROCESSING_HALTED = env_bool("GDPR_PROCESSING_HALTED", default=False)
GDPR_CONSENT_REQUIRED = env_bool("GDPR_CONSENT_REQUIRED", default=True)
GDPR_ERASURE_SLA_DAYS = env_int("GDPR_ERASURE_SLA_DAYS", 30)
RETENTION_FINANCIAL_YEARS = env_int("RETENTION_FINANCIAL_YEARS", 7)

# Field-level encryption (apps/core/encryption.py). Fail-closed on use.
# Rotation: comma-separated keys, newest first.
FIELD_ENCRYPTION_KEY = env_str("FIELD_ENCRYPTION_KEY", "") or ""

# --------------------------------------------------------------------------
# Third-party integration settings (empty = integration disabled)
# --------------------------------------------------------------------------
STRIPE_SECRET_KEY = env_str("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = env_str("STRIPE_WEBHOOK_SECRET", "")
STRIPE_CONNECT_CLIENT_ID = env_str("STRIPE_CONNECT_CLIENT_ID", "")
STRIPE_TAX_ENABLED = env_bool("STRIPE_TAX_ENABLED", default=False)

# --------------------------------------------------------------------------
# Internal payment API — Model A (ADR-0005). Fail-closed: a caller with an
# empty key is rejected by payments_app.internal_auth. Keys come from the
# secret store (never git); TEST mode keys only under test settings.
# --------------------------------------------------------------------------
INTERNAL_CALLERS = {
    "hub-payments": {
        "product": "hub",
        "key": env_str("INTERNAL_CALLER_HUB_KEY", ""),
    },
    "marketplace-internal": {
        "product": "marketplace",
        "key": env_str("INTERNAL_CALLER_MARKETPLACE_KEY", ""),
    },
}
INTERNAL_WEBHOOK_TARGETS = {
    "hub": env_str("INTERNAL_WEBHOOK_HUB_URL", ""),
}
INTERNAL_WEBHOOK_KEYS = {
    "hub": env_str("INTERNAL_WEBHOOK_HUB_KEY", ""),
}
# Drill switch (contract §9 degraded mode); never enabled outside drills.
INTERNAL_PAYMENTS_SIMULATE_OUTAGE = env_bool("INTERNAL_PAYMENTS_SIMULATE_OUTAGE", default=False)

AI_DEFAULT_PROVIDER = env_str("AI_DEFAULT_PROVIDER", "selfhosted")
AI_SELFHOSTED_BASE_URL = env_str("AI_SELFHOSTED_BASE_URL", "")
AI_SELFHOSTED_API_KEY = env_str("AI_SELFHOSTED_API_KEY", "")
AI_SELFHOSTED_MODEL = env_str("AI_SELFHOSTED_MODEL", "qwen3")
DEEPL_API_KEY = env_str("DEEPL_API_KEY", "")
OPENAI_API_KEY = env_str("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = env_str("ANTHROPIC_API_KEY", "")
# PII guardrail switch — see ai_service_app.guardrails.protect(): setting it
# to 0 makes outbound AI calls FAIL-CLOSED, it never bypasses the filter.
AI_PII_FILTER_ENABLED = env_bool("AI_PII_FILTER_ENABLED", default=True)

BITRIX24_ENABLED = env_bool("BITRIX24_ENABLED", default=False)
BITRIX24_WEBHOOK_URL = env_str("BITRIX24_WEBHOOK_URL", "")

DPD_API_BASE_URL = env_str("DPD_API_BASE_URL", "")
DPD_API_KEY = env_str("DPD_API_KEY", "")
OMNIVA_API_BASE_URL = env_str("OMNIVA_API_BASE_URL", "")
OMNIVA_API_USER = env_str("OMNIVA_API_USER", "")
OMNIVA_API_KEY = env_str("OMNIVA_API_KEY", "")

SENTRY_DSN = env_str("SENTRY_DSN", "")
OTEL_EXPORTER_OTLP_ENDPOINT = env_str("OTEL_EXPORTER_OTLP_ENDPOINT", "")

SEARCH_BACKEND = env_str(
    "SEARCH_BACKEND", "apps.search_app.backends.postgres.PostgresSearchBackend"
)

# --------------------------------------------------------------------------
# Logging — structlog configured via observability.setup_observability()
# --------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "jol.audit": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

setup_observability()
