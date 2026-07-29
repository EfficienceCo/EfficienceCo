CREATE INDEX idx_processos_cliente_id ON processos(cliente_id);
CREATE INDEX idx_etapas_processo_id ON etapas(processo_id);
CREATE INDEX idx_etapas_ordem ON etapas(processo_id, ordem);