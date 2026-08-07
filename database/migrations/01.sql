CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) UNIQUE,
    status VARCHAR(20) DEFAULT 'ativo',
    total_usuarios INTEGER DEFAULT 0, -- Coluna para armazenar o número de funcionários
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Criar tabela de usuários com Chave Composta
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