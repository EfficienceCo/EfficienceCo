-- FOLHA-8 (#748): checklist automático da folha.
-- Decisão: efficience-vault/decisoes/2026-11-20-folha-8-checklist-automatico.md.
--
-- 1. chk_etapas_acao aceita as 3 ações da folha (concluídas pelo pipeline, nunca pelo
--    agente nem por clique).
-- 2. Um processo folha_pagamento por cliente + mês (índice único parcial). Fecha a corrida
--    entre o upload (que passa a criar o processo se faltar) e o job do dia 1.
-- 3. Converte para as 6 etapas novas os processos de folha em andamento que ainda têm as
--    5 etapas manuais antigas e nenhuma concluída. Os demais ficam como estão.
-- 4. Uma etapa por processo + ordem (índice único). Sustenta a recuperação idempotente do
--    código (upsert que ignora duplicata) quando dois uploads acham o mesmo processo vazio.
-- 5. Processos de folha em andamento SEM nenhuma etapa (o criador antigo gravava o processo
--    e o INSERT das etapas podia falhar) recebem as 6 etapas. O código também recupera sob
--    demanda (recuperarEtapasPadraoFolha); aqui só adianta o que já existe.
--
-- Idempotente. 109 (#752) e 110 (#753, #754) estão em PRs abertos; esta é a 111
-- (renumerar no rebase se outra entrar antes).

BEGIN;

-- 1. Ações aceitas ------------------------------------------------------------------
ALTER TABLE etapas DROP CONSTRAINT IF EXISTS chk_etapas_acao;
ALTER TABLE etapas
  ADD CONSTRAINT chk_etapas_acao
  CHECK (
    acao IS NULL OR acao IN (
      'gerar_contrato_social',
      'criar_pastas',
      'folha_planilha_recebida',
      'folha_calculada',
      'folha_holerites_gerados'
    )
  );

-- 2. Um processo de folha por cliente + mês --------------------------------------------
-- Duplicata existente aborta a migration com a lista: nada de apagar processo em
-- silêncio. Resolver à mão (manter um por cliente + mês) e rodar de novo.
DO $$
DECLARE
  duplicatas TEXT;
BEGIN
  SELECT string_agg(
           format('cliente_id=%s mes_referencia=%s processos=%s', cliente_id, mes_referencia, ids),
           E'\n'
         )
    INTO duplicatas
    FROM (
      SELECT cliente_id, mes_referencia, string_agg(id::text, ',' ORDER BY criado_em) AS ids
        FROM processos
       WHERE tipo = 'folha_pagamento' AND mes_referencia IS NOT NULL
       GROUP BY cliente_id, mes_referencia
      HAVING count(*) > 1
    ) d;

  IF duplicatas IS NOT NULL THEN
    RAISE EXCEPTION E'Migration 111: processos folha_pagamento duplicados por cliente + mês. Resolva antes de aplicar:\n%', duplicatas;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_processos_folha_cliente_mes
  ON processos (cliente_id, mes_referencia)
  WHERE tipo = 'folha_pagamento' AND mes_referencia IS NOT NULL;

-- 3. Processos antigos sem nenhuma etapa concluída -------------------------------------
WITH alvo AS (
  SELECT p.id
    FROM processos p
   WHERE p.tipo = 'folha_pagamento'
     AND p.status = 'em_andamento'
     AND NOT EXISTS (
       SELECT 1 FROM etapas e WHERE e.processo_id = p.id AND (e.concluida OR e.tipo <> 'manual')
     )
     AND (
       SELECT array_agg(e.descricao::text ORDER BY e.ordem) FROM etapas e WHERE e.processo_id = p.id
     ) = ARRAY[
       'Inserir planilha Excel na pasta do mês',
       'Aguardar processamento automático pelo agente',
       'Revisar holerites gerados',
       'Enviar holerites às empresas',
       'Arquivar documentação do mês'
     ]::text[]
),
apagadas AS (
  DELETE FROM etapas e USING alvo WHERE e.processo_id = alvo.id RETURNING e.processo_id
)
INSERT INTO etapas (processo_id, descricao, tipo, acao, ordem)
SELECT alvo.id, nova.descricao, nova.tipo, nova.acao, nova.ordem
  FROM alvo
 CROSS JOIN (VALUES
   ('Planilha da folha recebida', 'automatizada', 'folha_planilha_recebida', 1),
   ('Folha calculada (INSS, IRRF e FGTS)', 'automatizada', 'folha_calculada', 2),
   ('Holerites e relatório de fechamento gerados', 'automatizada', 'folha_holerites_gerados', 3),
   ('Revisar holerites gerados', 'manual', NULL, 4),
   ('Enviar holerites às empresas', 'manual', NULL, 5),
   ('Arquivar documentação do mês', 'manual', NULL, 6)
 ) AS nova (descricao, tipo, acao, ordem);

-- 4. Uma etapa por processo + ordem ------------------------------------------------------
DO $$
DECLARE
  duplicatas TEXT;
BEGIN
  SELECT string_agg(format('processo_id=%s ordem=%s etapas=%s', processo_id, ordem, qtd), E'\n')
    INTO duplicatas
    FROM (
      SELECT processo_id, ordem, count(*) AS qtd
        FROM etapas
       GROUP BY processo_id, ordem
      HAVING count(*) > 1
    ) d;

  IF duplicatas IS NOT NULL THEN
    RAISE EXCEPTION E'Migration 111: etapas duplicadas por processo + ordem. Resolva antes de aplicar:\n%', duplicatas;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_etapas_processo_ordem ON etapas (processo_id, ordem);

-- 5. Processos de folha em andamento sem nenhuma etapa -------------------------------------
INSERT INTO etapas (processo_id, descricao, tipo, acao, ordem)
SELECT p.id, nova.descricao, nova.tipo, nova.acao, nova.ordem
  FROM processos p
 CROSS JOIN (VALUES
   ('Planilha da folha recebida', 'automatizada', 'folha_planilha_recebida', 1),
   ('Folha calculada (INSS, IRRF e FGTS)', 'automatizada', 'folha_calculada', 2),
   ('Holerites e relatório de fechamento gerados', 'automatizada', 'folha_holerites_gerados', 3),
   ('Revisar holerites gerados', 'manual', NULL, 4),
   ('Enviar holerites às empresas', 'manual', NULL, 5),
   ('Arquivar documentação do mês', 'manual', NULL, 6)
 ) AS nova (descricao, tipo, acao, ordem)
 WHERE p.tipo = 'folha_pagamento'
   AND p.status = 'em_andamento'
   AND NOT EXISTS (SELECT 1 FROM etapas e WHERE e.processo_id = p.id)
ON CONFLICT (processo_id, ordem) DO NOTHING;

COMMIT;

-- Rollback (só depois de reverter o backend; os processos convertidos ficam com as 6
-- etapas, que o código antigo trata como "Ação automatizada não suportada"):
-- BEGIN;
-- DROP INDEX IF EXISTS uq_etapas_processo_ordem;
-- DROP INDEX IF EXISTS uq_processos_folha_cliente_mes;
-- DELETE FROM etapas WHERE acao IN ('folha_planilha_recebida', 'folha_calculada', 'folha_holerites_gerados');
-- ALTER TABLE etapas DROP CONSTRAINT IF EXISTS chk_etapas_acao;
-- ALTER TABLE etapas ADD CONSTRAINT chk_etapas_acao
--   CHECK (acao IS NULL OR acao IN ('gerar_contrato_social', 'criar_pastas'));
-- COMMIT;
