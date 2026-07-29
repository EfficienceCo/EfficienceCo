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

ALTER TABLE obrigacoes ENABLE ROW LEVEL SECURITY;

-- Regra para usuários logados: Só veem/mexem nos dados do próprio cliente_id
CREATE POLICY "Policy_Obrigacoes_Isolamento" ON obrigacoes
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- Regra para o Agente: Permite que ele consulte se passar o ID na busca
CREATE POLICY "Agente: Leitura por ID Obrigacoes" ON obrigacoes
FOR SELECT TO anon 
USING (id IS NOT NULL);

-- 5. CRIAR OS ÍNDICES DE PERFORMANCE
CREATE INDEX idx_obrigacoes_cliente_id ON obrigacoes(cliente_id);
CREATE INDEX idx_obrigacoes_vencimento_status ON obrigacoes(data_vencimento, status);