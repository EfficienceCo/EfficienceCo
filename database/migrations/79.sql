ALTER TABLE processamentos_folha ADD COLUMN IF NOT EXISTS esocial_status TEXT DEFAULT 'nao_iniciado'
  CHECK (esocial_status IN ('nao_iniciado','s1200_enviado','s1210_enviado','fechado'));
ALTER TABLE processamentos_folha ADD COLUMN IF NOT EXISTS esocial_fechado_em TIMESTAMPTZ;