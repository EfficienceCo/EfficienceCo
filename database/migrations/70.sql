-- Garante que a coluna existe (caso o banco seja recriado do zero)
ALTER TABLE regras ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;
