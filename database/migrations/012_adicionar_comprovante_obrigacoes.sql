-- Migration 012: Adicionar coluna comprovante_path na tabela obrigacoes
ALTER TABLE obrigacoes ADD COLUMN IF NOT EXISTS comprovante_path TEXT;
