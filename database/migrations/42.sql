
CREATE POLICY "Sem leitura direta"
ON licencas FOR SELECT TO anon USING (false);

-- 2. Crie a função de validação (Security Definer ignora o RLS)
CREATE OR REPLACE FUNCTION validar_licenca(token_busca TEXT)
RETURNS TABLE (
  valida BOOLEAN,
  ativa BOOLEAN,
  validade TIMESTAMP
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (l.ativa AND (l.validade IS NULL OR l.validade > NOW())) AS valida,
    l.ativa,
    l.validade
  FROM licencas l
  WHERE l.token = token_busca;
END;
$$;

-- 3. Libera o agente (role anon) para chamar a função
GRANT EXECUTE ON FUNCTION validar_licenca(TEXT) TO anon;