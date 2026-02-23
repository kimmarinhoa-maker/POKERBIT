-- Migration 010: Payment Type (Fiado/A Vista) por agente por settlement
ALTER TABLE agent_week_metrics
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'fiado'
  CHECK (payment_type IN ('fiado', 'avista'));
