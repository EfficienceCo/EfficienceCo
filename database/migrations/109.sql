-- FOLHA-2 (#742): guarda os erros por linha da planilha para o contador ver quais
-- linhas corrigir. Antes só a contagem ia para motivo_erro; o detalhe ia para o log.
-- Formato: [{ "linha": 3, "motivos": ["cpf inválido"] }, ...]. NULL = sem erro de planilha.
-- 104–108 e 110/111 estão em PRs abertos ou na main; esta é a 109.
-- Aplicar ANTES de publicar o backend que lê/grava erros_planilha.
ALTER TABLE processamentos_folha
  ADD COLUMN IF NOT EXISTS erros_planilha JSONB;

-- Rollback (somente depois de reverter o backend que usa a coluna):
-- ALTER TABLE processamentos_folha DROP COLUMN IF EXISTS erros_planilha;
