CREATE POLICY "Leitura por token de licença"
ON licencas
FOR SELECT
TO anon
USING (id = (auth.jwt() ->> 'token_licenca')::uuid);