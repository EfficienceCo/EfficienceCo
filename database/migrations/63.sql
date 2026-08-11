-- Remove o CHECK antigo e recria com os valores corretos
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS chk_tipo_notificacao;

ALTER TABLE notificacoes
  ADD CONSTRAINT chk_tipo_notificacao CHECK (
    tipo IN (
      'obrigacao_vencendo',
      'processo_atrasado',
      'arquivo_processado',
      'arquivo_recebido',
      'arquivo_erro'
    )
  );