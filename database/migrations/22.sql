-- ==============================================================================
-- MIGRATION: 008_criar_processos.sql
-- DESCRIÇÃO: Criação das tabelas de processos e etapas (checklist) com RLS.
-- ==============================================================================

-- 1. CRIAR A TABELA 'PROCESSOS' (Tabela Pai)
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

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapas ENABLE ROW LEVEL SECURITY;

-- 4. CRIAR AS POLÍTICAS DE ACESSO (Isolamento por cliente_id)

-- Políticas para a tabela de PROCESSOS
DROP POLICY IF EXISTS "Policy_Processos_Isolamento" ON processos;
CREATE POLICY "Policy_Processos_Isolamento" ON processos
    FOR ALL TO authenticated
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- Políticas para a tabela de ETAPAS
DROP POLICY IF EXISTS "Policy_Etapas_Isolamento" ON etapas;
CREATE POLICY "Policy_Etapas_Isolamento" ON etapas
    FOR ALL TO authenticated
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- 5. CRIAR ÍNDICES PARA PERFORMANCE (Dashboard e Ordenação de Etapas)
CREATE INDEX idx_processos_cliente_id ON processos(cliente_id);
CREATE INDEX idx_etapas_processo_id ON etapas(processo_id);
CREATE INDEX idx_etapas_ordem ON etapas(processo_id, ordem);