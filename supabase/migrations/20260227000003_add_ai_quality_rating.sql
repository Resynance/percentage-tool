CREATE TABLE ai_quality_jobs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "totalRecords" INT,
  "processedCount" INT NOT NULL DEFAULT 0,
  "errorCount" INT NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_quality_ratings (
  id TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES ai_quality_jobs(id) ON DELETE CASCADE,
  "recordId" TEXT NOT NULL,
  content TEXT NOT NULL,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  reasoning TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_quality_ratings_job_id ON ai_quality_ratings("jobId");
CREATE INDEX idx_ai_quality_jobs_environment ON ai_quality_jobs(environment);
