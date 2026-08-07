DO $$
DECLARE
  v_cliente_id UUID;
  v_processo_id UUID;
BEGIN

  -- 1. Busca ou cria um Cliente de Teste para o ambiente local
  SELECT id INTO v_cliente_id 
  FROM clientes 
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (nome)
    VALUES ('TechCorp Soluções LTDA (Seed)')
    RETURNING id INTO v_cliente_id;
  END IF;

  -- 2. Cria o Processo do tipo 'abertura_empresa'
  INSERT INTO processos (cliente_id, tipo, status)
  VALUES (
    v_cliente_id, 
    'abertura_empresa', 
    'em_andamento'
  )
  RETURNING id INTO v_processo_id;

  -- 3. Insere o Checklist de Etapas Híbrido (Manuais vs Automatizadas em múltiplos estados)
  
  -- Etapa 1: MANUAL + CONCLUÍDA
  INSERT INTO etapas (processo_id, descricao, ordem, concluida, concluida_em, tipo, acao)
  VALUES (
    v_processo_id, 
    'Coleta de documentos dos sócios e IPTU do imóvel', 
    1, 
    TRUE, 
    NOW() - INTERVAL '2 days', 
    'manual', 
    NULL
  );

  -- Etapa 2: AUTOMATIZADA + CONCLUÍDA
  INSERT INTO etapas (processo_id, descricao, ordem, concluida, concluida_em, tipo, acao)
  VALUES (
    v_processo_id, 
    'Criar estrutura de pastas no Google Drive do cliente', 
    2, 
    TRUE, 
    NOW() - INTERVAL '1 day', 
    'automatizada', 
    'criar_pastas'
  );

  -- Etapa 3: AUTOMATIZADA + CONCLUÍDA
  INSERT INTO etapas (processo_id, descricao, ordem, concluida, concluida_em, tipo, acao)
  VALUES (
    v_processo_id, 
    'Gerar minuta do Contrato Social em PDF', 
    3, 
    TRUE, 
    NOW() - INTERVAL '4 hours', 
    'automatizada', 
    'gerar_contrato_social'
  );

  -- Etapa 4: MANUAL + PENDENTE
  INSERT INTO etapas (processo_id, descricao, ordem, concluida, concluida_em, tipo, acao)
  VALUES (
    v_processo_id, 
    'Assinatura dos sócios no Contrato Social (Gov.br ou Clicksign)', 
    4, 
    FALSE, 
    NULL, 
    'manual', 
    NULL
  );

  -- Etapa 5: AUTOMATIZADA + PENDENTE
  INSERT INTO etapas (processo_id, descricao, ordem, concluida, concluida_em, tipo, acao)
  VALUES (
    v_processo_id, 
    'Disparar robô de protocolo na Junta Comercial', 
    5, 
    FALSE, 
    NULL, 
    'automatizada', 
    'criar_pastas' -- Exemplo reutilizando a ação
  );

  -- Etapa 6: MANUAL + PENDENTE
  INSERT INTO etapas (processo_id, descricao, ordem, concluida, concluida_em, tipo, acao)
  VALUES (
    v_processo_id, 
    'Emitir taxa DARE/DARF e enviar para o cliente pagar', 
    6, 
    FALSE, 
    NULL, 
    'manual', 
    NULL
  );

  RAISE NOTICE 'Seed executado com sucesso! Processo ID criado: %', v_processo_id;

END $$;