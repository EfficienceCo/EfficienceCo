BEGIN;

-- 1. Remover políticas abertas legadas para o papel 'anon'
DROP POLICY IF EXISTS "Agente: Inserir eventos" ON eventos;
DROP POLICY IF EXISTS "Agente: Leitura por ID Obrigacoes" ON obrigacoes;
DROP POLICY IF EXISTS "Agente: Leitura total regras" ON regras;
DROP POLICY IF EXISTS "Agente: Leitura licencas" ON licencas;

-- 2. Bloquear consulta direta da role 'anon' em licencas e regras
DROP POLICY IF EXISTS "Sem leitura direta" ON licencas;
CREATE POLICY "Sem leitura direta" ON licencas 
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "Sem leitura direta de regras" ON regras;
CREATE POLICY "Sem leitura direta de regras" ON regras 
  FOR SELECT TO anon USING (false);

-- 3. Permitir que 'anon' insira eventos apenas vinculados a um cliente válido (exemplo de regra segura)
CREATE POLICY "Agente: Inserir eventos validos" ON eventos
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clientes c WHERE c.id = cliente_id AND c.status = 'ativo'
    )
  );

COMMIT;