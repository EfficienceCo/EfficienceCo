-- ==============================================================================
-- MIGRATION: 009_criar_notificacoes.sql
-- DESCRIÇÃO: Criação da tabela de notificações (alertas) com RLS.
-- ==============================================================================

-- 1. CRIAR A TABELA 'NOTIFICACOES'
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

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- 3. CRIAR AS POLÍTICAS DE ACESSO (Isolamento por cliente_id)
DROP POLICY IF EXISTS "Policy_Notificacoes_Isolamento" ON notificacoes;
CREATE POLICY "Policy_Notificacoes_Isolamento" ON notificacoes
    FOR ALL TO authenticated
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- 4. CRIAR ÍNDICES (Acelera a busca por notificações não lidas no painel do usuário)
CREATE INDEX idx_notificacoes_cliente_id ON notificacoes(cliente_id);
CREATE INDEX idx_notificacoes_nao_lidas ON notificacoes(cliente_id, lida) WHERE lida = FALSE;

ALTER TABLE notificacoes 
ALTER COLUMN tipo SET DEFAULT 'arquivo_recebido';
