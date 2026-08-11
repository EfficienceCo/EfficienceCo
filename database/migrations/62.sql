
BEGIN;

-- Remove a política antiga/duplicada de leitura por licença para anon
DROP POLICY IF EXISTS "Leitura de regras por licença" ON regras;

-- Remove a política redundante de SELECT para authenticated em eventos
DROP POLICY IF EXISTS "Leitura de eventos por cliente autenticado" ON eventos;

COMMIT;