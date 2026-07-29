CREATE POLICY "Usuarios só veem dados da própria empresa" 
ON usuarios
FOR ALL 
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);