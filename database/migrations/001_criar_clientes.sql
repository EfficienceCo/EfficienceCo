-- Migration 001: Criar tabela de clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE,
  status VARCHAR(20) DEFAULT 'ativo',
  criado_em TIMESTAMP DEFAULT NOW()
);
