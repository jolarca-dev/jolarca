"""Compliance API serializers (GAP-C01/C04).

Frontend contract: consent-store.ts sends category booleans using frontend
names (analytics/marketing/preferences); the backend model uses
ConsentPurpose values (analytics/marketing/personalization). The mapping
is confined to this module so views stay declarative.
"""

from rest_framework import serializers


class ConsentRecordRequestSerializer(serializers.Serializer):
    """POST /api/v1/compliance/consent/ — full consent snapshot.

    All category booleans are required so the audit record reflects the
    complete decision, not a delta. `necessary` is accepted but ignored —
    it is legally exempt and never stored as a ConsentRecord.
    """

    necessary = serializers.BooleanField(required=False, default=True)
    analytics = serializers.BooleanField()
    marketing = serializers.BooleanField()
    preferences = serializers.BooleanField()
    timestamp = serializers.DateTimeField()
    version = serializers.IntegerField(min_value=1)


class ConsentHistoryEntrySerializer(serializers.Serializer):
    """Single entry in the consent history response (GAP-C04)."""

    timestamp = serializers.DateTimeField()
    version = serializers.IntegerField()
    analytics = serializers.BooleanField()
    marketing = serializers.BooleanField()
    preferences = serializers.BooleanField()
