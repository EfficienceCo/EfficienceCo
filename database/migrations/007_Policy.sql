-- 1. Garante que o agente possa INSERIR eventos
-- Usamos 'true' aqui porque o seu controller já valida o token antes,
-- então o banco pode confiar na gravação que o agente envia.
DROP POLICY IF EXISTS "Agente: Inserir eventos" ON eventos;

CREATE POLICY "Agente: Inserir eventos" 
ON eventos 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- 2. (Opcional) Caso o agente também precise ler o que acabou de gravar
DROP POLICY IF EXISTS "Agente: Leitura de eventos" ON eventos;

CREATE POLICY "Agente: Leitura de eventos" 
ON eventos 
FOR SELECT 
TO anon 
USING (true);