-- ==============================================================================
-- MIGRATION: 010_adicionar_rls.sql
-- DESCRIÇÃO: Blindagem final de Row Level Security (RLS) para Produção.
-- ==============================================================================

-- 1. GARANTIR QUE A RLS ESTÁ ATIVA EM TODAS AS 8 TABELAS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE licencas ENABLE ROW LEVEL SECURITY;
ALTER TABLE obrigacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- 2. POLÍTICA DE BYPASS TOTAL PARA A 'service_role'
-- O Supabase já faz o bypass da service_role por padrão se a opção estiver ativa,
-- mas criar essas políticas explicitamente garante conformidade com o requisito "bypass total" da task.

CREATE POLICY "Service_Role: Acesso Total" ON clientes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service_Role: Acesso Total" ON usuarios FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service_Role: Acesso Total" ON regras FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service_Role: Acesso Total" ON eventos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service_Role: Acesso Total" ON licencas FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service_Role: Acesso Total" ON obrigacoes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service_Role: Acesso Total" ON processos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service_Role: Acesso Total" ON notificacoes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. POLÍTICAS DE ISOLAMENTO DE CLIENTE (Segunda linha de defesa para Authenticated)
-- Para garantir que "nenhum dado vaze mesmo que o backend omita o filtro por cliente_id"

-- Tabela Clientes (Onde o ID é a própria empresa)
DROP POLICY IF EXISTS "Policy_Clientes_Isolamento" ON clientes;
CREATE POLICY "Policy_Clientes_Isolamento" ON clientes FOR ALL TO authenticated 
    USING (id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (id = (auth.jwt() ->> 'cliente_id')::uuid);

-- Demais tabelas dependentes (Filtro obrigatório por cliente_id no JWT)
DROP POLICY IF EXISTS "Policy_Usuarios_Isolamento" ON usuarios;
CREATE POLICY "Policy_Usuarios_Isolamento" ON usuarios FOR ALL TO authenticated 
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

DROP POLICY IF EXISTS "Policy_Regras_Isolamento" ON regras;
CREATE POLICY "Policy_Regras_Isolamento" ON regras FOR ALL TO authenticated 
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

DROP POLICY IF EXISTS "Policy_Eventos_Isolamento" ON eventos;
CREATE POLICY "Policy_Eventos_Isolamento" ON eventos FOR ALL TO authenticated 
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

DROP POLICY IF EXISTS "Policy_Licencas_Isolamento" ON licencas;
CREATE POLICY "Policy_Licencas_Isolamento" ON licencas FOR ALL TO authenticated 
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

DROP POLICY IF EXISTS "Policy_Obrigacoes_Isolamento" ON obrigacoes;
CREATE POLICY "Policy_Obrigacoes_Isolamento" ON obrigacoes FOR ALL TO authenticated 
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

DROP POLICY IF EXISTS "Policy_Processos_Isolamento" ON processos;
CREATE POLICY "Policy_Processos_Isolamento" ON processos FOR ALL TO authenticated 
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

DROP POLICY IF EXISTS "Policy_Notificacoes_Isolamento" ON notificacoes;
CREATE POLICY "Policy_Notificacoes_Isolamento" ON notificacoes FOR ALL TO authenticated 
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid) 
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);