-- Hazina core schema. Every business row carries tenant_id and is guarded by
-- row-level security. The app role (hazina_app) is never the table owner, so the
-- policies always apply to it. The owner role runs migrations and seeds.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

-- The tenant for the current transaction, set by the API with
--   SELECT set_config('app.tenant_id', '<uuid>', true)
-- Unset or empty -> NULL -> every policy below matches nothing.
CREATE OR REPLACE FUNCTION app.current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE TABLE tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_currency char(3) NOT NULL DEFAULT 'UGX',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE person (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  display_name text NOT NULL,
  email text,
  firebase_uid text,
  role text NOT NULL CHECK (role IN ('owner', 'delegate', 'adviser', 'accountant', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, firebase_uid)
);

CREATE TABLE legal_entity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('individual', 'holding_company', 'company', 'trust')),
  parent_id uuid REFERENCES legal_entity(id),
  ownership_pct numeric(7, 4) CHECK (ownership_pct > 0 AND ownership_pct <= 100),
  dawinos_subsidiary_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE liability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('loan', 'mortgage', 'asset_finance', 'directors_loan', 'guarantee', 'other')),
  lender text,
  borrower_entity_id uuid REFERENCES legal_entity(id),
  currency char(3) NOT NULL,
  principal_minor bigint NOT NULL CHECK (principal_minor >= 0),
  annual_rate numeric(9, 6) NOT NULL DEFAULT 0,
  term_months integer CHECK (term_months > 0),
  first_payment_month char(7),
  repayment_type text NOT NULL DEFAULT 'annuity' CHECK (repayment_type IN ('annuity', 'bullet', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  name text NOT NULL,
  asset_class text NOT NULL CHECK (asset_class IN (
    'private_equity', 'land', 'property', 'listed_shares', 'treasury_bill', 'bond',
    'unit_trust', 'sacco', 'cash', 'vehicle', 'receivable', 'other')),
  owning_entity_id uuid REFERENCES legal_entity(id),
  currency char(3) NOT NULL,
  cost_minor bigint,
  liquidity_tier text NOT NULL CHECK (liquidity_tier IN ('same_day', 'one_month', 'one_year', 'illiquid')),
  role text NOT NULL CHECK (role IN ('matching', 'growth', 'personal_use')),
  pledged_to_liability_id uuid REFERENCES liability(id),
  maturity_date date,
  yield_rate numeric(9, 6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE valuation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  asset_id uuid NOT NULL REFERENCES asset(id),
  valued_on date NOT NULL,
  value_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  method text NOT NULL CHECK (method IN ('cost', 'nav', 'earnings_multiple', 'last_round', 'market_price', 'professional_valuation', 'owner_estimate')),
  source text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  approved_by uuid REFERENCES person(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  kind text NOT NULL,
  storage_key text NOT NULL,
  sha256 char(64) NOT NULL,
  asset_id uuid REFERENCES asset(id),
  liability_id uuid REFERENCES liability(id),
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Double-entry ledger. Lines are signed: debit positive, credit negative.
CREATE TABLE ledger_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  occurred_on date NOT NULL,
  description text NOT NULL,
  evidence_document_id uuid REFERENCES document(id),
  created_by uuid REFERENCES person(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  transaction_id uuid NOT NULL REFERENCES ledger_transaction(id) ON DELETE CASCADE,
  account text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor <> 0),
  currency char(3) NOT NULL,
  fx_rate_to_base numeric(18, 8) NOT NULL DEFAULT 1
);

-- A transaction must balance per currency at commit.
CREATE OR REPLACE FUNCTION app.assert_transaction_balanced() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  tx uuid := COALESCE(NEW.transaction_id, OLD.transaction_id);
  bad record;
BEGIN
  SELECT currency, sum(amount_minor) AS total INTO bad
    FROM ledger_line WHERE transaction_id = tx
    GROUP BY currency HAVING sum(amount_minor) <> 0 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ledger transaction % does not balance in % (off by %)', tx, bad.currency, bad.total;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_line_balanced
  AFTER INSERT OR UPDATE OR DELETE ON ledger_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.assert_transaction_balanced();

CREATE TABLE income_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('business', 'investment', 'property', 'other')),
  payer text,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('once', 'monthly', 'quarterly', 'termly', 'annual')),
  start_month char(7) NOT NULL,
  end_month char(7),
  term_months smallint[],
  escalation_rate numeric(9, 6) NOT NULL DEFAULT 0,
  reliability text NOT NULL CHECK (reliability IN ('contractual', 'expected', 'variable', 'one_off')),
  linked_asset_id uuid REFERENCES asset(id),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'dawinos', 'statement')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE obligation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('family', 'personal', 'business')),
  subcategory text,
  beneficiary text,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('once', 'monthly', 'quarterly', 'termly', 'annual')),
  start_month char(7) NOT NULL,
  end_month char(7),
  term_months smallint[],
  escalation_rate numeric(9, 6) NOT NULL DEFAULT 0,
  certainty text NOT NULL CHECK (certainty IN ('contractual', 'committed', 'planned', 'aspirational')),
  priority text NOT NULL CHECK (priority IN ('essential', 'important', 'discretionary')),
  flexibility text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'dawinos', 'adviser', 'template')),
  evidence_document_id uuid REFERENCES document(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projection_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  run_at timestamptz NOT NULL DEFAULT now(),
  start_month char(7) NOT NULL,
  inputs jsonb NOT NULL,
  result jsonb NOT NULL
);

-- Append-only audit trail. The app role may insert and read, never change.
CREATE TABLE audit_event (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenant(id),
  actor_person_id uuid REFERENCES person(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

-- Global reference data: no tenant, read-only to the app.
CREATE TABLE fx_rate (
  currency char(3) NOT NULL,
  rate_date date NOT NULL,
  rate_to_ugx numeric(18, 8) NOT NULL,
  source text NOT NULL,
  PRIMARY KEY (currency, rate_date)
);

-- Row-level security on every tenant table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['person', 'legal_entity', 'liability', 'asset', 'valuation', 'document',
    'ledger_transaction', 'ledger_line', 'income_source', 'obligation', 'projection_run', 'audit_event']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant())', t);
    EXECUTE format('CREATE INDEX ON %I (tenant_id)', t);
  END LOOP;
END $$;

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenant USING (id = app.current_tenant());

-- Grants for the app role.
GRANT USAGE ON SCHEMA public, app TO hazina_app;
GRANT EXECUTE ON FUNCTION app.current_tenant() TO hazina_app;
GRANT SELECT ON tenant, fx_rate TO hazina_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON person, legal_entity, liability, asset, valuation, document,
  ledger_transaction, ledger_line, income_source, obligation, projection_run TO hazina_app;
GRANT SELECT, INSERT ON audit_event TO hazina_app;
GRANT USAGE ON SEQUENCE audit_event_id_seq TO hazina_app;
