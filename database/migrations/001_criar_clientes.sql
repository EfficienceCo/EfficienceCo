-- Migration 001: Criar tabela de clientes
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) UNIQUE,
    status VARCHAR(20) DEFAULT 'ativo',
    total_usuarios INTEGER DEFAULT 0, -- Coluna para armazenar o número de funcionários
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);