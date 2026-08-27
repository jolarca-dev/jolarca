"""Contract tests for session lifecycle — GAP-U01/U02/U03.

Consumer-driven against frontend/src/lib/auth.ts (login/logout/getSession +
SessionUserSchema). AXES is disabled in test settings, so lockout behavior
is not asserted here — only the credential/posture contract.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from django.test import Client

from apps.sellers_app.models import Country, SellerProfile, SellerStatus
from apps.users_app.models import User

pytestmark = pytest.mark.django_db

PASSWORD = "correct-horse-battery-9"


def make_user(email: str | None = None) -> User:
    return User.objects.create_user(
        email=email or f"{uuid4().hex[:10]}@example.com", password=PASSWORD
    )


class TestLogin:
    def test_valid_credentials_open_a_session(self, client: Client):
        user = make_user()
        res = client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": PASSWORD, "remember": False},
            content_type="application/json",
        )
        assert res.status_code == 200
        body = res.json()
        assert body["id"] == str(user.pk)
        assert body["email"] == user.email
        assert body["role"] == "buyer"
        # The session actually works, not just the response body.
        assert client.get("/api/v1/auth/session/").status_code == 200

    def test_wrong_password_and_unknown_email_answer_identically(self, client: Client):
        user = make_user()
        wrong = client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": "nope-nope-nope-1"},
            content_type="application/json",
        )
        unknown = client.post(
            "/api/v1/auth/login/",
            {"email": f"ghost-{uuid4().hex[:8]}@example.com", "password": PASSWORD},
            content_type="application/json",
        )
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json() == {"error": "invalid_credentials"}

    def test_malformed_payload_is_400(self, client: Client):
        res = client.post(
            "/api/v1/auth/login/", {"email": "not-an-email"}, content_type="application/json"
        )
        assert res.status_code == 400


class TestSession:
    def test_anonymous_session_probe_is_401(self, client: Client):
        assert client.get("/api/v1/auth/session/").status_code == 401

    def test_seller_identity_is_projected(self, client: Client):
        user = make_user()
        SellerProfile.objects.create(
            user=user,
            company_name="Šventoji Crafts",
            country=Country.LT,
            status=SellerStatus.VERIFIED,
        )
        client.force_login(user)
        body = client.get("/api/v1/auth/session/").json()
        assert body["role"] == "seller"
        assert body["is_verified"] is True
        assert body["seller_slug"] == "sventoji-crafts"


class TestLogout:
    def test_logout_expires_the_session(self, client: Client):
        user = make_user()
        client.force_login(user)
        assert client.get("/api/v1/auth/session/").status_code == 200
        assert client.post("/api/v1/auth/logout/").status_code == 204
        assert client.get("/api/v1/auth/session/").status_code == 401

    def test_anonymous_logout_is_a_noop_204(self, client: Client):
        assert client.post("/api/v1/auth/logout/").status_code == 204
