-- Migration 002: Criar tabela de usuários
CREATE TABLE usuarios (
    id UUID DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    perfil VARCHAR(20) DEFAULT 'funcionario',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Define a união de ID + CLIENTE_ID como a Identidade Única
    PRIMARY KEY (id, cliente_id)
);