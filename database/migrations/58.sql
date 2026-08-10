BEGIN;

-- 1. Habilita o RLS na tabela
ALTER TABLE lancamentos_fiscais ENABLE ROW LEVEL SECURITY;

-- 2. Política de Leitura (SELECT)
-- Usuários autenticados só visualizam os lançamentos fiscais do seu próprio cliente
CREATE POLICY "Leitura de lancamentos fiscais por cliente autenticado"
ON lancamentos_fiscais
FOR SELECT
TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

-- 3. Política de Inserção (INSERT)
-- Garante que o registro inserido pertença ao cliente do usuário autenticado
CREATE POLICY "Insercao de lancamentos fiscais por cliente autenticado"
ON lancamentos_fiscais
FOR INSERT
TO authenticated
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

-- 4. Política de Atualização (UPDATE)
CREATE POLICY "Atualizacao de lancamentos fiscais por cliente autenticado"
ON lancamentos_fiscais
FOR UPDATE
TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()))
WITH CHECK (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

-- 5. Política de Exclusão (DELETE)
CREATE POLICY "Exclusao de lancamentos fiscais por cliente autenticado"
ON lancamentos_fiscais
FOR DELETE
TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

-- 6. Bloqueio total de acesso direto para chamadas anônimas (anon)
CREATE POLICY "Sem leitura direta anon"
ON lancamentos_fiscais
FOR SELECT
TO anon
USING (false);

COMMIT;