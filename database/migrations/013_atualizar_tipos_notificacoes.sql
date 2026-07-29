-- Migration 013: Atualizar CHECK constraint de notificacoes para incluir tipos de arquivo

-- 1. Removemos a validação antiga que está bloqueando o seu INSERT
ALTER TABLE notificacoes 
DROP CONSTRAINT IF EXISTS chk_tipo_notificacao;

-- 2. Garantimos que nenhum dado antigo remanescente quebre a nova regra
UPDATE notificacoes 
SET tipo = 'arquivo_processado' 
WHERE tipo = 'arquivo_recebido';

-- 3. Criamos a nova regra que aceita o 'arquivo_processado'
ALTER TABLE notificacoes 
ADD CONSTRAINT chk_tipo_notificacao 
CHECK (tipo IN ('obrigacao_vencendo', 'processo_atrasado', 'arquivo_processado'));

COMMIT;