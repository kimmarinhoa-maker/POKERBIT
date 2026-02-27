-- Migration 010: Payment Type (Fiado/A Vista) por agente por settlement
ALTER TABLE agent_week_metrics
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'fiado';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_agent_payment_type'
  ) THEN
    ALTER TABLE agent_week_metrics
      ADD CONSTRAINT chk_agent_payment_type CHECK (payment_type IN ('fiado', 'avista'));
  END IF;
END $$;
