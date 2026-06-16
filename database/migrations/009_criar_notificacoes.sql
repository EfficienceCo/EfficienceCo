-- Migration 009: Criar tabela de notificacoes internas
CREATE TABLE notificacoes (
    id UUID DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL, -- Corrigido de 'client_id' para 'cliente_id' para bater com a PK
    
    -- Tipo atualizado com as 3 opções da task (com os underlines corretos)
    tipo VARCHAR(50) DEFAULT 'obrigacao_vencendo' CONSTRAINT chk_tipo_notificacao 
        CHECK (tipo IN ('obrigacao_vencendo', 'processo_atrasado', 'arquivo_recebido')),
        
    mensagem TEXT NOT NULL,
    lida BOOLEAN DEFAULT FALSE, 
    criado_em TIMESTAMPTZ DEFAULT NOW(), -- Corrigido de TIMESTAMPZ para TIMESTAMPTZ

    -- Constraints de identificação e relacionamento
    CONSTRAINT pk_notificacoes PRIMARY KEY (id, cliente_id),
    
    -- Fechamento da FK que estava incompleto e adicionado o CASCADE
    CONSTRAINT fk_notificacoes_cliente FOREIGN KEY (cliente_id) 
        REFERENCES clientes(id) ON DELETE CASCADE
);