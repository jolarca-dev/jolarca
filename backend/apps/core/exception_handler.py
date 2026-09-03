"""Custom DRF exception handler — RFC 7807 ProblemDetail responses.

Every error response on the public API surface conforms to:

    {
        "type": "/errors/<slug>",
        "title": "Human-readable summary",
        "status": 400,
        "detail": "Request-specific explanation",
        "instance": "<request path>"
    }

The internal payment API (/internal/v1/) uses its own ``_problem()`` helper
(see payments_app.internal_views) and is NOT routed through this handler.
"""

from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

_STATUS_TITLES: dict[int, str] = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
}

_ERROR_SLUGS: dict[int, str] = {
    400: "validation-failed",
    401: "unauthenticated",
    403: "forbidden",
    404: "not-found",
    405: "method-not-allowed",
    409: "conflict",
    429: "throttled",
}


def custom_exception_handler(exc: Exception, context: dict) -> Response | None:
    """RFC 7807 ProblemDetail wrapper around DRF's default handler.

    Returns ``None`` for unhandled exceptions so Django's 500 machinery
    (and Sentry) sees them — the handler only formats *expected* errors.
    """
    request = context.get("request")
    instance = request.path if request else ""

    # Let DRF parse known API exceptions first (fills .detail / .status_code).
    response = drf_exception_handler(exc, context)

    if response is not None:
        status_code = response.status_code
        if isinstance(response.data, dict):
            detail = str(response.data.get("detail", response.data))
        elif isinstance(response.data, list) and response.data:
            detail = str(response.data[0])
        else:
            detail = str(response.data)

        return Response(
            {
                "type": f"/errors/{_ERROR_SLUGS.get(status_code, 'error')}",
                "title": _STATUS_TITLES.get(status_code, "Error"),
                "status": status_code,
                "detail": detail,
                "instance": instance,
            },
            status=status_code,
            headers=getattr(response, "headers", None),
        )

    # Unhandled server errors: return None → Django 500 + Sentry.
    return None
