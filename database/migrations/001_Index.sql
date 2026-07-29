-- 1. Índice para acelerar a busca por token de licença (Login/Validação)
CREATE INDEX idx_licencas_token ON licencas(token);

-- 2. Índice para acelerar o filtro de RLS e buscas por cliente em Regras
CREATE INDEX idx_regras_cliente_id ON regras(cliente_id);

-- 3. Índice para acelerar relatórios e logs de Eventos por cliente
CREATE INDEX idx_eventos_cliente_id ON eventos(cliente_id);