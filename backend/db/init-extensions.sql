-- Runs once at container first-init (docker-entrypoint-initdb.d), as superuser.
-- The application user connects with least privilege; it never creates extensions.
CREATE EXTENSION IF NOT EXISTS postgis;    -- geospatial catalog queries
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- at-rest column encryption path
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector semantic search (phase 2)
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive unique emails
