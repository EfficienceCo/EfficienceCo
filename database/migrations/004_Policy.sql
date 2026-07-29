CREATE POLICY "Leitura do Agente por token de licença"
ON licencas
FOR SELECT
TO anon
USING (true);