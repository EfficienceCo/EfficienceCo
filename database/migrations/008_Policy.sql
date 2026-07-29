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