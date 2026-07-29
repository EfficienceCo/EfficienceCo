-- Política para a tabela de CLIENTES (o cliente só vê seus próprios dados cadastrais)
CREATE POLICY "Clientes: acesso próprio" ON clientes
FOR ALL TO authenticated
USING (id = (auth.jwt() ->> 'cliente_id')::uuid);

-- Política para USUÁRIOS
CREATE POLICY "Usuários: isolamento por cliente" ON usuarios
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- Política para REGRAS
CREATE POLICY "Regras: isolamento por cliente" ON regras
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- Política para EVENTOS
CREATE POLICY "Eventos: isolamento por cliente" ON eventos
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);

-- Política para LICENÇAS
CREATE POLICY "Licenças: isolamento por cliente" ON licencas
FOR ALL TO authenticated
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);