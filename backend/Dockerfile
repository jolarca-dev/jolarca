# Single image; the compose command selects web | worker | beat.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# gdal-bin: runtime requirement of django.contrib.gis (pulls libgdal for the
# image's Debian release — do not pin a distro-specific library package name).
RUN apt-get update \
    && apt-get install -y --no-install-recommends gdal-bin curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements/base.txt requirements/prod.txt requirements/dev.txt requirements/
RUN pip install --require-hashes -r requirements/prod.txt

COPY . .

# CI/parity-test stage: adds pytest + dev tooling on top of the same base.
FROM base AS test
RUN pip install --require-hashes -r requirements/dev.txt

FROM base AS runtime

# Compliance: never run the service as root.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://localhost:8000/healthz/ || exit 1

# Default = web; worker/beat override via compose `command:`.
CMD ["gunicorn", "project.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "30"]
