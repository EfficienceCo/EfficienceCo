-- psql -X -v ON_ERROR_STOP=1 -f database/tests/92-folha-saida-status-smoke.sql
-- Fixtures temporárias sombreiam as tabelas reais; nada persiste após ROLLBACK.
BEGIN;
CREATE TEMP TABLE processamentos_folha (id text PRIMARY KEY, status text, motivo_erro text);
CREATE TEMP TABLE folha_calculos (processamento_id text, empresa text, holerite_path text);
CREATE TEMP TABLE folha_relatorios (processamento_id text, empresa text);

INSERT INTO processamentos_folha VALUES
  ('parcial', 'concluido', 'Falhou holerite de Maria'),
  ('sem_relatorio', 'concluido', 'Falhou relatório'),
  ('duas_empresas', 'concluido', 'Falhou relatório B'),
  ('falha_total', 'concluido', 'Falhou primeiro holerite'),
  ('completo', 'concluido', NULL),
  ('recuperado', 'concluido', 'Erro antigo de cálculo'),
  ('sem_calculos', 'concluido', NULL),
  ('aguardando', 'concluido', NULL),
  ('calculando', 'processando', 'Erro antigo');
INSERT INTO folha_calculos VALUES
  ('parcial', 'A', 'joao.pdf'), ('parcial', 'A', NULL),
  ('sem_relatorio', 'A', 'joao.pdf'),
  ('duas_empresas', 'A', 'joao.pdf'), ('duas_empresas', 'B', 'maria.pdf'),
  ('falha_total', 'A', NULL), ('completo', 'A', 'joao.pdf'),
  ('recuperado', 'A', 'joao.pdf'), ('recuperado', 'B', 'maria.pdf'),
  ('aguardando', 'A', NULL), ('calculando', 'A', NULL);
INSERT INTO folha_relatorios VALUES
  ('duas_empresas', 'A'), ('completo', 'A'),
  ('recuperado', 'A'), ('recuperado', 'B');

\ir ../migrations/92.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM processamentos_folha
    WHERE saida_status <> CASE
      WHEN id IN ('parcial', 'sem_relatorio', 'duas_empresas', 'falha_total') THEN 'erro'
      WHEN id IN ('completo', 'recuperado') THEN 'ok'
      ELSE 'pendente'
    END
  ) THEN RAISE EXCEPTION 'Classificação incorreta de saída completa/parcial'; END IF;
END $$;

-- Mesmo com todos os arquivos registrados, um erro operacional novo não é apagado.
UPDATE processamentos_folha SET saida_status = 'erro', motivo_erro = 'Erro operacional novo'
WHERE id = 'recuperado';
CREATE TEMP TABLE resultado_primeira_passagem AS SELECT * FROM processamentos_folha;

\ir ../migrations/92.sql

DO $$
BEGIN
  IF EXISTS (
    (SELECT * FROM processamentos_folha EXCEPT SELECT * FROM resultado_primeira_passagem)
    UNION ALL
    (SELECT * FROM resultado_primeira_passagem EXCEPT SELECT * FROM processamentos_folha)
  ) THEN RAISE EXCEPTION 'Replay alterou estado ou motivo de erro'; END IF;

  INSERT INTO processamentos_folha (id, status) VALUES ('novo', 'pendente');
  IF (SELECT saida_status FROM processamentos_folha WHERE id = 'novo') <> 'pendente'
  THEN RAISE EXCEPTION 'Default inválido'; END IF;

  BEGIN
    UPDATE processamentos_folha SET saida_status = 'invalido' WHERE id = 'novo';
    RAISE EXCEPTION 'Constraint permitiu status inválido';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
