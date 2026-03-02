-- ══════════════════════════════════════════════════════════════════════
--  025: Receipt short links — /r/{short_id} for compact comprovante URLs
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS receipt_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id text UNIQUE NOT NULL,
  settlement_id uuid NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  agent_metric_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receipt_links_short ON receipt_links(short_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_links_unique ON receipt_links(settlement_id, agent_metric_id);

-- RLS: only tenant owner can insert/select
ALTER TABLE receipt_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipt_links_tenant ON receipt_links
  FOR ALL USING (tenant_id = auth.uid());

-- Service role bypasses RLS (for public read via API route)
