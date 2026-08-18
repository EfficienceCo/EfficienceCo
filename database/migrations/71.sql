-- Usar o próximo número disponível (coordenar com quem fez AP-1)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS regime_tributario TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnae TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS anexo_simples TEXT CHECK (anexo_simples IN ('I','II','III','IV','V'));
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS historico_receita JSONB DEFAULT '[]'::jsonb;