-- 1. Garante RLS ativo e bloqueia o acesso direto de leituras anônimas na tabela notificacoes
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sem leitura direta de notificacoes"
ON notificacoes FOR SELECT TO anon USING (false);

-- 2. Cria a função que valida o token da tabela 'licencas' e busca as notificações
CREATE OR REPLACE FUNCTION obter_notificacoes_por_token(token_busca TEXT)
RETURNS TABLE (
    id UUID,
    cliente_id UUID,
    tipo VARCHAR(50),
    mensagem TEXT,
    lida BOOLEAN,
    criado_em TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id,
        n.cliente_id,
        n.tipo,
        n.mensagem,
        n.lida,
        n.criado_em
    FROM notificacoes n
    INNER JOIN licencas l ON l.cliente_id = n.cliente_id
    WHERE l.token = token_busca
      AND l.ativa = TRUE
      AND (l.validade IS NULL OR l.validade > NOW())
    ORDER BY n.criado_em DESC;
END;
$$;

-- 3. Libera a execução da função para a role 'anon'
GRANT EXECUTE ON FUNCTION obter_notificacoes_por_token(TEXT) TO anon;