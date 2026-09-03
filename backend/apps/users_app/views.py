from django.contrib.auth import authenticate, login, logout
from django.core.exceptions import PermissionDenied
from django.utils.decorators import method_decorator
from django.utils.text import slugify
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from . import services
from .serializers import RegisterSerializer, UserSerializer


@extend_schema(request=RegisterSerializer, responses={201: UserSerializer})
class RegisterView(APIView):
    """POST /api/v1/auth/register/ — creates a buyer account."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]  # 60/min anon (settings.REST_FRAMEWORK)

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = services.register(
                email=serializer.validated_data["email"],
                password=serializer.validated_data["password"],
                language=serializer.validated_data["language"],
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.headers.get("User-Agent", ""),
            )
        except services.RegistrationError as exc:
            return Response({"error": "registration_failed", "detail": str(exc)}, status=409)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    # trim_whitespace=False: passwords are opaque secrets, never "cleaned".
    password = serializers.CharField(trim_whitespace=False)
    remember = serializers.BooleanField(required=False, default=False)


class SessionUserSerializer(serializers.Serializer):
    """Consumer-driven against frontend/src/lib/auth.ts SessionUserSchema."""

    id = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=["buyer", "seller", "admin"])
    language = serializers.CharField(required=False)
    is_verified = serializers.BooleanField(required=False)
    seller_slug = serializers.CharField(required=False, allow_null=True)


def _session_payload(user) -> dict:
    """Session projection — PII stays out: id, email, role, seller ref only."""
    # Lazy import: sellers_app depends on users_app, never the reverse at
    # module load.
    from apps.sellers_app.models import SellerProfile, SellerStatus

    role = "admin" if user.is_staff else "buyer"
    language = ""
    profile = getattr(user, "profile", None)
    if profile is not None:
        language = profile.preferred_language
    seller = SellerProfile.objects.filter(user=user).first()
    if seller is not None and role == "buyer":
        role = "seller"
    return {
        "id": str(user.pk),
        "email": user.email,
        "role": role,
        "language": language,
        "is_verified": seller is not None and seller.status == SellerStatus.VERIFIED,
        "seller_slug": slugify(seller.company_name) if seller is not None else None,
    }


@extend_schema(request=LoginSerializer, responses={200: SessionUserSerializer})
class LoginView(APIView):
    """POST /api/v1/auth/login/ — email/password session login (GAP-U01).

    Brute-force protection comes from AxesStandaloneBackend in
    AUTHENTICATION_BACKENDS: lockouts raise PermissionDenied out of
    authenticate() and surface as 429. Failed logins answer a single
    generic 401 — never which half (email vs password) was wrong
    (no user enumeration).
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []  # anonymous by definition; no CSRF gate
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = authenticate(
                request,
                username=serializer.validated_data["email"],
                password=serializer.validated_data["password"],
            )
        except PermissionDenied:
            # axes lockout (SOC 2 CC6.1) — honest 429, not a fake 401.
            return Response({"error": "locked_out"}, status=429)
        if user is None:
            return Response({"error": "invalid_credentials"}, status=401)
        login(request, user)
        if not serializer.validated_data["remember"]:
            # Browser-session expiry; `remember` keeps the default 2 weeks.
            request.session.set_expiry(0)
        return Response(_session_payload(user))


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — expires the session (GAP-U02).

    Anonymous logout is a 204 no-op, never an error: clients clear local
    state regardless, and punishing an already-expired session invites
    retry loops.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(responses={200: SessionUserSerializer})
@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    """GET /api/v1/auth/session/ — current session user (GAP-U03).

    401 for anonymous callers (the frontend maps 401/403 to `null` —
    probing the session must never redirect or toast).

    The @ensure_csrf_cookie decorator guarantees that Django sets the
    JS-readable CSRF cookie on this safe GET, so the frontend can prime
    it before any mutating request (double-submit pattern).
    """

    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"error": "unauthenticated"}, status=401)
        return Response(_session_payload(request.user))
