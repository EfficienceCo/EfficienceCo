-- Migration 006: Adicionar atualizado_em na tabela regras
ALTER TABLE regras ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT NOW();

-- Inicializa com criado_em para registros existentes
UPDATE regras SET atualizado_em = criado_em WHERE atualizado_em IS NULL;

-- Trigger para atualizar automaticamente ao modificar uma regra
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_regras
BEFORE UPDATE ON regras
FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
