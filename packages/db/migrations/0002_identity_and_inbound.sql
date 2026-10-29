-- The ONE cross-tenant read: map a verified Firebase uid to its person and tenant.
-- SECURITY DEFINER runs as the owner, so it can see past RLS, but it returns only
-- the caller's own identity rows. Everything after this runs tenant-scoped.
CREATE OR REPLACE FUNCTION app.resolve_identity(p_firebase_uid text)
  RETURNS TABLE (person_id uuid, tenant_id uuid, role text, display_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id, tenant_id, role, display_name FROM person WHERE firebase_uid = p_firebase_uid
$$;
REVOKE ALL ON FUNCTION app.resolve_identity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_identity(text) TO hazina_app;

-- Inbound DawinOS events: verify signature, store raw, reply fast, process on a queue
-- (the receive-save-queue pattern from DawinOS functions/src/integrations/quickbooks/webhook.js).
-- Not tenant-scoped on arrival: the worker maps the subsidiary to a tenant.
CREATE TABLE inbound_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'needs_review')),
  processed_at timestamptz,
  error text,
  UNIQUE (source, event_id)
);
GRANT SELECT, INSERT, UPDATE ON inbound_event TO hazina_app;
