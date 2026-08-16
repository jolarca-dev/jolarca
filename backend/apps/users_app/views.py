from drf_spectacular.utils import extend_schema
from rest_framework import status
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
