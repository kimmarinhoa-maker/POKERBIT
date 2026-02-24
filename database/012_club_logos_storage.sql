-- ══════════════════════════════════════════════════════════════════════
--  012 — Club Logos Storage Bucket
--  Rodar no Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════

-- Criar bucket publico para logos de clubes
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-logos', 'club-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users podem upload
CREATE POLICY "Authenticated upload club-logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'club-logos');

-- Authenticated users podem deletar
CREATE POLICY "Authenticated delete club-logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'club-logos');

-- Leitura publica (logos nao sao sensiveis)
CREATE POLICY "Public read club-logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'club-logos');

-- Authenticated users podem update (sobrescrever)
CREATE POLICY "Authenticated update club-logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'club-logos');
