"""Content-Security-Policy middleware for Django-served surfaces.

Explicit, auditable policy lives in settings.CSP_POLICY (not a third-party
package), so the control is visible in security review and CODEOWNERS.
"""

from django.conf import settings


class ContentSecurityPolicyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        policy = getattr(settings, "CSP_POLICY", None)
        if policy:
            response["Content-Security-Policy"] = "; ".join(
                f"{directive} {' '.join(sources)}" for directive, sources in policy.items()
            )
        return response
