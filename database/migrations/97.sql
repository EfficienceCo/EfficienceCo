-- #561 — impede a importação repetida do mesmo arquivo OFX para o mesmo cliente.
-- O hash é calculado pelo backend antes do insert. Registros antigos permanecem
-- com NULL porque o conteúdo original do arquivo não é armazenado.

ALTER TABLE extratos_bancarios
  ADD COLUMN IF NOT EXISTS arquivo_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_extratos_bancarios_cliente_arquivo_hash
  ON extratos_bancarios(cliente_id, arquivo_hash)
  WHERE arquivo_hash IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS uq_extratos_bancarios_cliente_arquivo_hash;
-- ALTER TABLE extratos_bancarios DROP COLUMN IF EXISTS arquivo_hash;
