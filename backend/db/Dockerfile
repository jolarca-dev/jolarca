# PostgreSQL 16 + PostGIS + pgvector.
# No public image ships both PostGIS and pgvector, so we extend the official
# PostGIS image with the pgvector extension from the PGDG repository.
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

# Extensions are created here (not in Django migrations): CREATE EXTENSION
# requires superuser, and the app user must remain least-privileged.
COPY init-extensions.sql /docker-entrypoint-initdb.d/00-extensions.sql

# Trivy DS-0002: explicit non-root USER. The postgres entrypoint drops
# privileges to the postgres user internally; this satisfies the scanner.
USER postgres
