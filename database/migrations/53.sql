BEGIN;

-- 1. Remoção da política permissiva de leitura na tabela eventos
DROP POLICY IF EXISTS "Agente: Leitura de eventos" ON eventos;

-- 2. (Opcional) Se os eventos precisarem de leitura por usuários autenticados do próprio cliente
CREATE POLICY "Leitura de eventos por cliente autenticado" 
ON eventos 
FOR SELECT 
TO authenticated 
USING (cliente_id = auth.uid()); -- ou a função/regra do seu multi-tenant (ex: cliente_id em (SELECT ...))

COMMIT;