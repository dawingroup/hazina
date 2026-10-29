-- Local only. Mirrors the role split used in Cloud SQL:
--   hazina_owner owns the schema and runs migrations.
--   hazina_app is what the API and worker connect as. It is NOT the table owner
--   and has NOBYPASSRLS, so row-level security always applies to it.
CREATE ROLE hazina_owner LOGIN PASSWORD 'hazina_owner';
CREATE ROLE hazina_app LOGIN PASSWORD 'hazina_app' NOBYPASSRLS;
GRANT ALL ON DATABASE hazina TO hazina_owner;
ALTER DATABASE hazina OWNER TO hazina_owner;
GRANT CONNECT ON DATABASE hazina TO hazina_app;
