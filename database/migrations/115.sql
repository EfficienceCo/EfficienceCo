-- FOLHA-6 (#746): a listagem de processamentos mostra quem enviou e por onde (web ou agente).
-- Linhas antigas ficam como 'web' sem remetente (o dado nunca foi gravado).
ALTER TABLE processamentos_folha
  ADD COLUMN IF NOT EXISTS origem VARCHAR NOT NULL DEFAULT 'web' CHECK (origem IN ('web', 'agente')),
  ADD COLUMN IF NOT EXISTS enviado_por UUID;

-- Rollback:
-- ALTER TABLE processamentos_folha DROP COLUMN IF EXISTS enviado_por, DROP COLUMN IF EXISTS origem;
