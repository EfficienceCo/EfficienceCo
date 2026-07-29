-- 2. POLÍTICAS PARA A TABELA 'CLIENTES'
-- O cliente (empresa) só pode gerir a sua própria linha
DROP POLICY IF EXISTS "Policy_Clientes_Isolamento" ON clientes;
CREATE POLICY "Policy_Clientes_Isolamento" ON clientes
FOR ALL TO authenticated
USING (id = (auth.jwt() ->> 'cliente_id')::uuid)
WITH CHECK (id = (auth.jwt() ->> 'cliente_id')::uuid);

-- 3. POLÍTICAS PARA A TABELA 'USUARIOS'
DROP POLICY IF EXISTS "Policy_Usuarios_Isolamento" ON usuarios;
CREATE POLICY "Policy_Usuarios_Isolamento" ON usuarios
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- 4. POLÍTICAS PARA A TABELA 'REGRAS'
DROP POLICY IF EXISTS "Policy_Regras_Isolamento" ON regras;
CREATE POLICY "Policy_Regras_Isolamento" ON regras
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- 5. POLÍTICAS PARA A TABELA 'EVENTOS'
DROP POLICY IF EXISTS "Policy_Eventos_Isolamento" ON eventos;
CREATE POLICY "Policy_Eventos_Isolamento" ON eventos
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- 6. POLÍTICAS PARA A TABELA 'LICENCAS'
DROP POLICY IF EXISTS "Policy_Licencas_Isolamento" ON licencas;
CREATE POLICY "Policy_Licencas_Isolamento" ON licencas
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid)
WITH CHECK (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);