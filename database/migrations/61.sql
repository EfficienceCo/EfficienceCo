

BEGIN;

-- 1. Tabela EVENTOS: Remove a política de SELECT redundante (pois a Policy_Eventos_Isolamento já cobre ALL)
DROP POLICY IF EXISTS "Leitura de eventos por cliente autenticado" ON eventos;

-- 2. Tabela REGRAS: Remove a política legada de leitura por licença para a role 'anon'
-- Mantém apenas a "Sem leitura direta de regras" (USING false)
DROP POLICY IF EXISTS "Leitura de regras por licença" ON regras;

COMMIT;