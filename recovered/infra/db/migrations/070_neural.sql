-- Scope-specific model routing and an independent, durable usage ledger.
CREATE TABLE neural_settings (
  responsibility_scope_id uuid PRIMARY KEY REFERENCES responsibility_scopes(id),
  profiles jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(profiles)='array'),
  tasks jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(tasks)='object'),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE neural_usage (
  id uuid PRIMARY KEY,
  responsibility_scope_id uuid NOT NULL REFERENCES responsibility_scopes(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  task text NOT NULL CHECK(task IN ('conversation_summary','work_order_prices')),
  profile_id text NOT NULL,
  provider text NOT NULL CHECK(provider IN ('openai','anthropic','qwen','glm','yandex')),
  model text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','success','failed')),
  input_tokens bigint CHECK(input_tokens>=0),
  output_tokens bigint CHECK(output_tokens>=0),
  cached_input_tokens bigint CHECK(cached_input_tokens>=0),
  cache_write_tokens bigint CHECK(cache_write_tokens>=0),
  cost numeric(22,10) CHECK(cost>=0),
  currency text NOT NULL CHECK(currency IN ('USD','RUB','CNY')),
  pricing jsonb NOT NULL CHECK(jsonb_typeof(pricing)='object'),
  metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object'),
  error_code text,
  duration_ms integer CHECK(duration_ms>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK((status='pending' AND completed_at IS NULL) OR (status<>'pending' AND completed_at IS NOT NULL))
);
CREATE INDEX neural_usage_scope_time ON neural_usage(responsibility_scope_id,created_at DESC,id);
GRANT SELECT,INSERT ON neural_settings,neural_usage TO transport_app;
GRANT UPDATE(profiles,tasks,updated_by,updated_at) ON neural_settings TO transport_app;
GRANT UPDATE(status,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,cost,error_code,duration_ms,completed_at) ON neural_usage TO transport_app;
