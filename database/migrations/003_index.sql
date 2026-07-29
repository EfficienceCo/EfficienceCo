CREATE INDEX idx_notificacoes_cliente_id ON notificacoes(cliente_id);
CREATE INDEX idx_notificacoes_nao_lidas ON notificacoes(cliente_id, lida) WHERE lida = FALSE;