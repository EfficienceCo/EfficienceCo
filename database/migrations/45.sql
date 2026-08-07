-- 4. Função de inserção validada pelo token da licença
CREATE OR REPLACE FUNCTION criar_notificacao_por_token(
    token_busca TEXT,
    p_tipo VARCHAR(50),
    p_mensagem TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cliente_id UUID;
    v_novo_id UUID;
BEGIN
    -- Busca o cliente_id associado ao token válido
    SELECT l.cliente_id INTO v_cliente_id
    FROM licencas l
    WHERE l.token = token_busca
      AND l.ativa = TRUE
      AND (l.validade IS NULL OR l.validade > NOW());

    IF v_cliente_id IS NULL THEN
        RAISE EXCEPTION 'Token inválido, expirado ou inativo.';
    END IF;

    -- Realiza o INSERT ignorando o RLS
    INSERT INTO notificacoes (cliente_id, tipo, mensagem)
    VALUES (v_cliente_id, p_tipo, p_mensagem)
    RETURNING id INTO v_novo_id;

    RETURN v_novo_id;
END;
$$;

-- 5. Libera a execução para a role 'anon'
GRANT EXECUTE ON FUNCTION criar_notificacao_por_token(TEXT, VARCHAR, TEXT) TO anon;