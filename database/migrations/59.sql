CREATE POLICY "Acesso total service_role"
ON lancamentos_fiscais
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);