CREATE POLICY "Users only see their own licenses" 
ON licencas 
FOR SELECT 
TO anon 
USING (cliente_id = (auth.jwt() ->> 'cliente_id')::uuid);