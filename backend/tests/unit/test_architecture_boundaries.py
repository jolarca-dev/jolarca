"""Architecture fitness functions — module isolation that CI does not otherwise gate.

`docs/architecture/01-modular-breakdown.md:5-18` declares a forbidden-imports table and
`CONTRIBUTING.md:48-70` calls those rejections automatic. They were not: no test
asserted any of them (QODER.md §8, gap G6). These checks convert the highest-risk rules
from review-only into build gates.

Pure AST over `backend/apps/**` — no DB, no Django setup, no network — so it runs inside
the fast suite (`Makefile:54`, `ci.yml:55`). Migrations are excluded, matching ruff's
`extend-exclude` (`backend/pyproject.toml:53`): they are generated and reference other
apps by string label, not by import.

Carrier and LLM SDK containment is deliberately NOT asserted: no such SDK is a
dependency (`backend/pyproject.toml:11-29`). Carriers sit behind the `Carrier` protocol
with clients confined to `shipping_app/carriers/` — currently unwired stubs raising
`NotImplementedError`, which `shipping_app/services.py:87` handles as a carrier failure.
LLM providers sit behind `LLMProvider` (`providers/base.py:12`) with clients confined to
`ai_service_app/providers/`, transport over plain `requests`. `requests` cannot be
confined: it is legitimately used by `ai_service_app/providers/*`,
`payments_app/internal_forward.py` and `tax_app/vies_client.py`.

When a vendor SDK is actually adopted, add it to `SDK_CONTAINMENT` above in the same PR.
"""

import ast
import pathlib

import pytest

BACKEND = pathlib.Path(__file__).resolve().parents[2]
APPS = BACKEND / "apps"
CORE = "core"

# Third-party SDK -> the only app permitted to import it.
SDK_CONTAINMENT = {
    "stripe": "payments_app",  # PCI DSS SAQ-A: the single card-data boundary
    "zeep": "tax_app",  # EU VIES SOAP client (backend/pyproject.toml:28)
}

# Reachable from Celery only. An import in a request/response module means inference or
# CRM egress on the request path — README.md:41, 01-modular-breakdown.md:16-17.
NON_REQUEST_APPS = frozenset({"ai_service_app", "bitrix24_integration_app"})
REQUEST_PATH_FILES = ("views.py", "viewsets.py", "serializers.py", "forms.py")

# Known cross-app `models` imports, baselined so the count can only go down. Keyed by
# (path relative to backend/, target app) — deliberately line-number-free, since line
# numbers shift on any edit above them and would churn the baseline on unrelated diffs.
# Burn one down by routing the call through the owning app's `services.py`, then delete
# its entry; the "stale" assertion below forces that deletion.
CROSS_APP_MODEL_BASELINE = frozenset(
    {
        ("apps/ai_service_app/tasks.py", "products_app"),
        ("apps/bitrix24_integration_app/tasks.py", "users_app"),
        ("apps/compliance_app/retention.py", "orders_app"),
        ("apps/compliance_app/services.py", "users_app"),
        ("apps/orders_app/cart_views.py", "products_app"),
        ("apps/orders_app/views.py", "products_app"),
        ("apps/payments_app/tasks.py", "sellers_app"),
        ("apps/products_app/serializers.py", "sellers_app"),
        ("apps/search_app/backends/postgres.py", "products_app"),
        ("apps/search_app/tasks.py", "products_app"),
        ("apps/search_app/views.py", "products_app"),
        ("apps/search_app/views.py", "sellers_app"),
        ("apps/sellers_app/views.py", "products_app"),
        ("apps/tax_app/tasks.py", "compliance_app"),
        ("apps/tax_app/tasks.py", "orders_app"),
        ("apps/users_app/views.py", "sellers_app"),
    }
)

KNOWN_APPS = frozenset(
    p.name for p in APPS.iterdir() if p.is_dir() and not p.name.startswith(("_", "."))
)
DOMAIN_APPS = KNOWN_APPS - {CORE}


def _iter_sources():
    for path in sorted(APPS.rglob("*.py")):
        if "__pycache__" in path.parts or "migrations" in path.parts:
            continue
        yield path


def _imports(tree):
    """Every absolute import in the tree, at any nesting depth.

    Depth matters: the only real `import stripe` statements live *inside functions*
    (`payments_app/services.py:25`, `payments_app/webhooks.py:30`), so a
    module-level-only scan misses exactly the pattern most likely to be reintroduced.
    """
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                yield node.module


def _target_app(module):
    """The app an `apps.<app>...` module belongs to, else None."""
    parts = module.split(".")
    if len(parts) > 1 and parts[0] == "apps" and parts[1] in KNOWN_APPS:
        return parts[1]
    return None


def _rel(path):
    return path.relative_to(BACKEND).as_posix()


@pytest.fixture(scope="module")
def scanned():
    """Parse each app source once for the whole module: [(path, app, imports)]."""
    return [
        (path, path.relative_to(APPS).parts[0], list(_imports(ast.parse(path.read_text("utf-8")))))
        for path in _iter_sources()
    ]


@pytest.mark.parametrize(("sdk", "owner"), sorted(SDK_CONTAINMENT.items()))
def test_sdk_imports_confined_to_owning_app(scanned, sdk, owner):
    offenders = [
        f"{_rel(path)} imports {mod}"
        for path, app, imports in scanned
        if app != owner
        for mod in imports
        if mod == sdk or mod.startswith(f"{sdk}.")
    ]
    assert not offenders, (
        f"`{sdk}` is importable only inside `{owner}` — it is that app's declared boundary "
        f"(01-modular-breakdown.md:12). Offenders:\n" + "\n".join(offenders)
    )


def test_core_imports_no_domain_app(scanned):
    """`core` is the base layer; importing a domain app inverts the dependency."""
    offenders = [
        f"{_rel(path)} imports {mod}"
        for path, app, imports in scanned
        if app == CORE
        for mod in imports
        if _target_app(mod) is not None
    ]
    assert not offenders, (
        "`core` must not import ANY domain app (01-modular-breakdown.md:7). Offenders:\n"
        + "\n".join(offenders)
    )


def test_bitrix24_not_imported_by_marketplace_apps(scanned):
    """CRM sync is outbound-only; marketplace apps must not depend on it."""
    offenders = [
        f"{_rel(path)} imports {mod}"
        for path, app, imports in scanned
        if app != "bitrix24_integration_app"
        for mod in imports
        if _target_app(mod) == "bitrix24_integration_app"
    ]
    assert not offenders, (
        "`bitrix24_integration_app` must not be imported by marketplace apps "
        "(01-modular-breakdown.md:17). Offenders:\n" + "\n".join(offenders)
    )


def test_ai_service_app_reachable_only_via_tasks(scanned):
    """`tasks.py` is ai_service_app's only public interface."""
    offenders = [
        f"{_rel(path)} imports {mod}"
        for path, app, imports in scanned
        if app != "ai_service_app"
        for mod in imports
        if _target_app(mod) == "ai_service_app" and not mod.endswith(".tasks")
    ]
    assert not offenders, (
        "Only `apps.ai_service_app.tasks` may be imported from outside — importing "
        "`providers`/`guardrails` directly bypasses the AI guardrails "
        "(01-modular-breakdown.md:16). Offenders:\n" + "\n".join(offenders)
    )


def test_request_path_modules_import_no_ai_or_crm(scanned):
    """No inference or CRM egress on the request path — enqueue to Celery instead."""
    offenders = [
        f"{_rel(path)} imports {mod}"
        for path, _app, imports in scanned
        if path.name.endswith(REQUEST_PATH_FILES)
        for mod in imports
        if _target_app(mod) in NON_REQUEST_APPS
    ]
    assert not offenders, (
        "Request/response modules must not import AI or CRM apps; enqueue to the `ai` "
        "queue via Celery (README.md:41, CONTRIBUTING.md:62). Offenders:\n" + "\n".join(offenders)
    )


def test_cross_app_model_imports_match_baseline(scanned):
    """Ratchet: cross-app `models` imports may only shrink, never grow.

    `CONTRIBUTING.md:63-66` requires cross-app access via the owning app's `services.py`.
    Sixteen call sites predate that rule and are baselined above rather than refactored
    here — fixing them is a separate, reviewed change per app, not a side effect of
    adding a test. `core.models` is exempt: models + utilities are core's declared
    public interface (01-modular-breakdown.md:7).
    """
    found = {
        (_rel(path), target)
        for path, app, imports in scanned
        if app != CORE
        for mod in imports
        if (target := _target_app(mod)) is not None
        and target not in (CORE, app)
        and mod.split(".")[2:3] == ["models"]
    }

    new = sorted(found - CROSS_APP_MODEL_BASELINE)
    assert not new, (
        "New direct cross-app model import(s) — go through the owning app's services.py "
        "(CONTRIBUTING.md:63). If the import is genuinely required, add it to "
        "CROSS_APP_MODEL_BASELINE in this file with a comment saying why:\n"
        + "\n".join(f"{path} -> {target}" for path, target in new)
    )

    stale = sorted(CROSS_APP_MODEL_BASELINE - found)
    assert not stale, (
        "Baseline entries no longer violated — delete them so the ratchet stays honest:\n"
        + "\n".join(f"{path} -> {target}" for path, target in stale)
    )
