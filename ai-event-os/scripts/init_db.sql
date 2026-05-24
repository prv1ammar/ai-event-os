-- scripts/init_db.sql
-- Runs once when the PostgreSQL container is first created.
-- The database and user are already created by Docker env variables;
-- this script just enables useful extensions.

\connect aievent_db;

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fast text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Statistics (optional, used by query planner)
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
