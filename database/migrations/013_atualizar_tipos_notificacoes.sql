-- Migration 013: Atualizar CHECK constraint de notificacoes para incluir tipos de arquivo
ALTER TABLE notificacoes
  DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;

ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IN ('obrigacao_vencendo', 'processo_atrasado', 'arquivo_recebido', 'arquivo_processado', 'arquivo_erro'));
