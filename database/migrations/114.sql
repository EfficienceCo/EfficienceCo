-- FOLHA-2 (#742): guarda os erros por linha da planilha para o contador ver quais
-- linhas corrigir. Antes só a contagem ia para motivo_erro; o detalhe ia para o log.
-- Formato: [{ "linha": 3, "motivos": ["cpf inválido"] }, ...]. NULL = sem erro de planilha.
-- 109 é da Apuração (#736/#738/#739/#752), 110 de #741/#744, 111 de #748, 112 de #743 e
-- 113 de #745; esta é a 114. Se o ambiente já aplicou a 109 antiga desta task (PR #757,
-- mergeado e revertido), o IF NOT EXISTS evita erro: a coluna já existe e nada muda.
-- Aplicar ANTES de publicar o backend que lê/grava erros_planilha.
ALTER TABLE processamentos_folha
  ADD COLUMN IF NOT EXISTS erros_planilha JSONB;

-- Rollback (somente depois de reverter o backend que usa a coluna):
-- ALTER TABLE processamentos_folha DROP COLUMN IF EXISTS erros_planilha;
