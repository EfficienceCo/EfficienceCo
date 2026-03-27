-- Migration 003: Criar tabela de licenças
CREATE TABLE IF NOT EXISTS licencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id),
  token TEXT UNIQUE NOT NULL,
  ativa BOOLEAN DEFAULT FALSE,
  validade TIMESTAMP,
  criado_em TIMESTAMP DEFAULT NOW()
);
