BEGIN;

-- 1. Remove a constraint CHECK legada
ALTER TABLE notificacoes 
  DROP CONSTRAINT IF EXISTS chk_tipo_notificacao;

-- 2. Recria a constraint expandida com os novos tipos
ALTER TABLE notificacoes 
  ADD CONSTRAINT chk_tipo_notificacao 
  CHECK (tipo IN (
    'obrigacao_vencendo', 
    'processo_atrasado', 
    'arquivo_processado', 
    'arquivo_recebido', 
    'arquivo_erro'
  ));

-- 3. Ajusta o default da coluna (opcional, se quiser padronizar como 'arquivo_recebido')
ALTER TABLE notificacoes 
  ALTER COLUMN tipo SET DEFAULT 'arquivo_recebido';

COMMIT;