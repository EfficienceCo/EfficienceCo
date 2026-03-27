-- Migration 004: Criar tabela de regras de automação
CREATE TABLE IF NOT EXISTS regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id),
  pasta_origem TEXT,
  pasta_destino TEXT,
  condicao TEXT,
  acao VARCHAR(50),
  ativa BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT NOW()
);
