from rest_framework import serializers

from .models import User


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True, min_length=12, style={"input_type": "password"}
    )
    language = serializers.ChoiceField(choices=["lt", "lv", "et", "en"], default="en")


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "date_joined")
        read_only_fields = fields
