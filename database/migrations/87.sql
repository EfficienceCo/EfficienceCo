-- CD-3 (#410) — job diário de alertas 60/30/7 em certificados digitais.
-- Idempotência por marco alertado; tipo de notificação dedicado.

ALTER TABLE certificados_digitais
  ADD COLUMN IF NOT EXISTS ultimo_marco_alertado INTEGER;

ALTER TABLE certificados_digitais
  DROP CONSTRAINT IF EXISTS certificados_digitais_ultimo_marco_alertado_check;

ALTER TABLE certificados_digitais
  ADD CONSTRAINT certificados_digitais_ultimo_marco_alertado_check
  CHECK (ultimo_marco_alertado IS NULL OR ultimo_marco_alertado IN (60, 30, 7));

ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS chk_tipo_notificacao;

ALTER TABLE notificacoes
  ADD CONSTRAINT chk_tipo_notificacao CHECK (
    tipo IN (
      'obrigacao_vencendo',
      'processo_atrasado',
      'arquivo_processado',
      'arquivo_recebido',
      'arquivo_erro',
      'certificado_vencendo'
    )
  );
