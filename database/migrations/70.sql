BEGIN;

-- Formaliza regras.versao: coluna existia no banco sem nenhuma migration que a
-- criasse (ver arquitetura/reforma-bd.md, item 2 e issue #286).
ALTER TABLE regras ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;

-- Versionamento real fica a nivel de cliente, nao de linha: MAX(regras.versao)
-- nunca captura uma regra deletada (nenhuma linha muda), entao o agente nao
-- percebia remocoes mesmo com o incremento em criar/atualizar.
CREATE TABLE regras_versao (
  cliente_id    UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  versao        INTEGER NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill: cliente que ja tem regra hoje comeca em versao 1
INSERT INTO regras_versao (cliente_id, versao)
SELECT DISTINCT cliente_id, 1 FROM regras
ON CONFLICT (cliente_id) DO NOTHING;

-- Upsert atomico usado pelo backend a cada criar/atualizar/deletar regra
CREATE OR REPLACE FUNCTION incrementar_versao_regras(p_cliente_id UUID)
RETURNS INTEGER AS $$
DECLARE
  nova_versao INTEGER;
BEGIN
  INSERT INTO regras_versao (cliente_id, versao)
  VALUES (p_cliente_id, 1)
  ON CONFLICT (cliente_id)
  DO UPDATE SET versao = regras_versao.versao + 1, atualizado_em = NOW()
  RETURNING versao INTO nova_versao;
  RETURN nova_versao;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE regras_versao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de regras_versao por cliente autenticado"
ON regras_versao FOR SELECT TO authenticated
USING (cliente_id = (SELECT cliente_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "Sem leitura direta anon regras_versao"
ON regras_versao FOR SELECT TO anon USING (false);

CREATE POLICY "Acesso total service_role regras_versao"
ON regras_versao FOR ALL TO service_role
USING (true) WITH CHECK (true);

COMMIT;
