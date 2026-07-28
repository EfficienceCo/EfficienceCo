-- Migration 018: Migrar regras.condicao de TEXT para JSONB (INFRA-REGRAS-ENRICH)
-- Formato novo (todos os campos opcionais, ver tasks/efficience-co-tasks-atuais.md):
--   { "in_name": "FOLHA", "extensao": "pdf", "tipo": "holerite", "tamanho": {...}, "criado_em": {...} }
--
-- Regras existentes no formato legado (ex: "extensao=.pdf", não é JSON válido) viram
-- NULL em vez de quebrar a migration com erro de cast — precisam ser recriadas no
-- formato JSONB pelo admin depois.
ALTER TABLE regras ALTER COLUMN condicao TYPE JSONB USING CASE
  WHEN condicao IS NULL OR condicao = '' THEN NULL
  WHEN condicao ~ '^\s*[\{\[]' THEN condicao::JSONB
  ELSE NULL
END;

-- Rollback: ALTER TABLE regras ALTER COLUMN condicao TYPE TEXT USING condicao::TEXT;
-- (perde a estrutura JSONB, volta a representação textual do objeto — não recupera o
-- formato legado "extensao=.pdf" de regras que já tinham virado NULL antes do rollback)
