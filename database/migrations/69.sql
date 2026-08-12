CREATE POLICY "Acesso total service_role lancamentos contabeis"
ON lancamentos_contabeis FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total service_role extratos bancarios"
ON extratos_bancarios FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total service_role transacoes extrato"
ON transacoes_extrato FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total service_role conciliacoes"
ON conciliacoes FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total service_role pares conciliacao"
ON pares_conciliacao FOR ALL TO service_role
USING (true) WITH CHECK (true);