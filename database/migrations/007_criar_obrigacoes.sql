CREATE TABLE obrigacoes (
    id UUID DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(20) NOT NULL CONSTRAINT chk_tipo_obrigacao 
        CHECK (tipo IN ('mensal', 'anual', 'eventual')), 
    data_vencimento DATE NOT NULL,
    recorrente BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'pendente' CONSTRAINT chk_status_obrigacao 
        CHECK (status IN ('pendente', 'concluida', 'atrasada')),
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT pk_obrigacoes PRIMARY KEY (id, cliente_id),
    FOREIGN KEY (cliente_id) 
        REFERENCES clientes(id) ON DELETE CASCADE
);