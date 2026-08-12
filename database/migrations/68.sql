BEGIN;

-- lancamentos_contabeis
ALTER TABLE lancamentos_contabeis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de lancamentos contabeis por cliente autenticado"
ON lancamentos_contabeis FOR SELECT TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Insercao de lancamentos contabeis por cliente autenticado"
ON lancamentos_contabeis FOR INSERT TO authenticated
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Atualizacao de lancamentos contabeis por cliente autenticado"
ON lancamentos_contabeis FOR UPDATE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()))
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Exclusao de lancamentos contabeis por cliente autenticado"
ON lancamentos_contabeis FOR DELETE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Sem leitura direta anon lancamentos contabeis"
ON lancamentos_contabeis FOR SELECT TO anon USING (false);

-- extratos_bancarios
ALTER TABLE extratos_bancarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de extratos bancarios por cliente autenticado"
ON extratos_bancarios FOR SELECT TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Insercao de extratos bancarios por cliente autenticado"
ON extratos_bancarios FOR INSERT TO authenticated
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Atualizacao de extratos bancarios por cliente autenticado"
ON extratos_bancarios FOR UPDATE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()))
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Exclusao de extratos bancarios por cliente autenticado"
ON extratos_bancarios FOR DELETE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Sem leitura direta anon extratos bancarios"
ON extratos_bancarios FOR SELECT TO anon USING (false);

-- transacoes_extrato
ALTER TABLE transacoes_extrato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de transacoes extrato por cliente autenticado"
ON transacoes_extrato FOR SELECT TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Insercao de transacoes extrato por cliente autenticado"
ON transacoes_extrato FOR INSERT TO authenticated
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Atualizacao de transacoes extrato por cliente autenticado"
ON transacoes_extrato FOR UPDATE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()))
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Exclusao de transacoes extrato por cliente autenticado"
ON transacoes_extrato FOR DELETE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Sem leitura direta anon transacoes extrato"
ON transacoes_extrato FOR SELECT TO anon USING (false);

-- conciliacoes
ALTER TABLE conciliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de conciliacoes por cliente autenticado"
ON conciliacoes FOR SELECT TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Insercao de conciliacoes por cliente autenticado"
ON conciliacoes FOR INSERT TO authenticated
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Atualizacao de conciliacoes por cliente autenticado"
ON conciliacoes FOR UPDATE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()))
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Exclusao de conciliacoes por cliente autenticado"
ON conciliacoes FOR DELETE TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Sem leitura direta anon conciliacoes"
ON conciliacoes FOR SELECT TO anon USING (false);

-- pares_conciliacao (nao tem cliente_id direto — resolve via conciliacoes)
ALTER TABLE pares_conciliacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de pares conciliacao por cliente autenticado"
ON pares_conciliacao FOR SELECT TO authenticated
USING (
  (SELECT cliente_id FROM conciliacoes WHERE id = conciliacao_id)
  = (SELECT cliente_id FROM usuarios WHERE id = auth.uid())
);

CREATE POLICY "Insercao de pares conciliacao por cliente autenticado"
ON pares_conciliacao FOR INSERT TO authenticated
WITH CHECK (
  (SELECT cliente_id FROM conciliacoes WHERE id = conciliacao_id)
  = (SELECT cliente_id FROM usuarios WHERE id = auth.uid())
);

CREATE POLICY "Atualizacao de pares conciliacao por cliente autenticado"
ON pares_conciliacao FOR UPDATE TO authenticated
USING (
  (SELECT cliente_id FROM conciliacoes WHERE id = conciliacao_id)
  = (SELECT cliente_id FROM usuarios WHERE id = auth.uid())
)
WITH CHECK (
  (SELECT cliente_id FROM conciliacoes WHERE id = conciliacao_id)
  = (SELECT cliente_id FROM usuarios WHERE id = auth.uid())
);

CREATE POLICY "Exclusao de pares conciliacao por cliente autenticado"
ON pares_conciliacao FOR DELETE TO authenticated
USING (
  (SELECT cliente_id FROM conciliacoes WHERE id = conciliacao_id)
  = (SELECT cliente_id FROM usuarios WHERE id = auth.uid())
);

CREATE POLICY "Sem leitura direta anon pares conciliacao"
ON pares_conciliacao FOR SELECT TO anon USING (false);

COMMIT;