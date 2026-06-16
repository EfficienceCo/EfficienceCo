CREATE TABLE processos (
    id UUID DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL,
    tipo VARCHAR(50) NOT NULL CONSTRAINT chk_tipo_processo 
        CHECK (tipo IN ('folha_pagamento', 'abertura_empresa')),
    status VARCHAR(20) DEFAULT 'em_andamento' CONSTRAINT chk_status_processo 
        CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT pk_processos PRIMARY KEY (id, cliente_id),
    CONSTRAINT fk_processos_cliente FOREIGN KEY (cliente_id) 
        REFERENCES clientes(id) ON DELETE CASCADE
);

-- 2. CRIAR A TABELA 'ETAPAS' (Tabela Filho - Checklist)
CREATE TABLE etapas (
    id UUID DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL,
    cliente_id UUID NOT NULL, -- Incluído para manter o padrão da chave composta
    descricao VARCHAR(255) NOT NULL,
    concluida BOOLEAN DEFAULT FALSE,
    ordem INTEGER NOT NULL,
    concluida_em TIMESTAMPTZ NULL, 
    CONSTRAINT pk_etapas PRIMARY KEY (id, processo_id),
    CONSTRAINT fk_etapas_processo FOREIGN KEY (processo_id, cliente_id) 
        REFERENCES processos(id, cliente_id) ON DELETE CASCADE
);
