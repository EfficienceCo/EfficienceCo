BEGIN;

-- 1. Remove a política antiga do 12.sql
DROP POLICY IF EXISTS "Users only see their own licenses" ON licencas;

-- 2. Remove a política antiga do 13.sql
DROP POLICY IF EXISTS "Leitura por token de licença" ON licencas;

-- 3. Garante que a role 'anon' não faz leitura direta (forçando o uso do validar_licenca)
DROP POLICY IF EXISTS "Sem leitura direta" ON licencas;
CREATE POLICY "Sem leitura direta" 
ON licencas 
FOR SELECT 
TO anon 
USING (false);

COMMIT;