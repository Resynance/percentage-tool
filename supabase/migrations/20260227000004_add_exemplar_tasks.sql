CREATE TABLE exemplar_tasks (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exemplar_tasks_environment ON exemplar_tasks(environment);
