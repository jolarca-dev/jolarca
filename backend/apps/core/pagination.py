from rest_framework.pagination import LimitOffsetPagination


class StandardResultsSetPagination(LimitOffsetPagination):
    """Single pagination contract for the whole API (OpenAPI stability).

    LimitOffsetPagination with max_limit=100 per architectural spec.
    """

    default_limit = 20
    max_limit = 100
