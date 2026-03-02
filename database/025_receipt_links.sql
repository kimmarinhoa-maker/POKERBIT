-- ══════════════════════════════════════════════════════════════════════
--  025: Receipt short links — /r/{id} for compact comprovante URLs
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS receipt_links (
  id text PRIMARY KEY,
  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  agent_metric_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_links_unique ON receipt_links(settlement_id, agent_metric_id);

-- RLS: allow public read (via service role in API route), restrict writes
ALTER TABLE receipt_links ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by both generate and public read API routes)
