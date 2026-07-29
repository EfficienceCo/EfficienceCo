DROP POLICY IF EXISTS "Policy_Notificacoes_Isolamento" ON notificacoes;
CREATE POLICY "Policy_Notificacoes_Isolamento" ON notificacoes
    FOR ALL TO authenticated
    USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
    WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);
