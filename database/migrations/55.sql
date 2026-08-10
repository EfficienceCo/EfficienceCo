BEGIN;

-- Recria o índice para otimizar filtros por cliente e status na tabela de processos
CREATE INDEX IF NOT EXISTS idx_processos_cliente_status 
ON processos (cliente_id, status);

COMMIT;