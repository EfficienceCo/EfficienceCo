BEGIN;

-- regras.versao nunca funcionou como versionamento: e por linha, entao MAX(regras.versao)
-- nao captura uma regra deletada (nenhuma linha muda) e nem criarRegra nem atualizarRegra
-- escreviam nela. Tambem nunca teve migration que a criasse (arquitetura/reforma-bd.md,
-- item 2, e issue #286). Como regras.cliente_id e NOT NULL REFERENCES clientes(id), a
-- relacao com cliente e 1:1 -- o contador de versao pertence a clientes, nao a uma tabela
-- nova.
ALTER TABLE regras DROP COLUMN IF EXISTS versao;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS versao_regras INTEGER NOT NULL DEFAULT 1;

-- Upsert atomico usado pelo backend a cada criar/atualizar/deletar regra
CREATE OR REPLACE FUNCTION incrementar_versao_regras(p_cliente_id UUID)
RETURNS INTEGER AS $$
DECLARE
  nova_versao INTEGER;
BEGIN
  UPDATE clientes
  SET versao_regras = versao_regras + 1
  WHERE id = p_cliente_id
  RETURNING versao_regras INTO nova_versao;
  RETURN nova_versao;
END;
$$ LANGUAGE plpgsql;

COMMIT;
