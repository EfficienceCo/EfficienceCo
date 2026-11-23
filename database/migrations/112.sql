-- FOLHA-3 (#743): o status só vira 'concluido' depois dos PDFs prontos.
-- 'calculado' = cálculo salvo em folha_calculos, arquivos de saída ainda pendentes ou com falha.
-- A FS12 da Apuração e o download usam apenas 'concluido'.
-- 109 é do PR da #742, 110 dos PRs #741/#744 e 111 do #748; esta é a 112.
-- Aplicar ANTES de publicar o backend que grava 'calculado'.
ALTER TABLE processamentos_folha DROP CONSTRAINT IF EXISTS processamentos_folha_status_check;
ALTER TABLE processamentos_folha
  ADD CONSTRAINT processamentos_folha_status_check
  CHECK (status IN ('pendente', 'processando', 'calculado', 'concluido', 'erro'));

-- Legado: 'concluido' sem os arquivos prontos (saida_status pendente ou erro) passa a 'calculado'.
-- Só reclassifica quem ainda está 'concluido', então rodar de novo não muda nada.
UPDATE processamentos_folha
SET status = 'calculado'
WHERE status = 'concluido' AND saida_status <> 'ok';

-- Rollback (somente depois de reverter o backend):
-- UPDATE processamentos_folha SET status = 'concluido' WHERE status = 'calculado';
-- ALTER TABLE processamentos_folha DROP CONSTRAINT processamentos_folha_status_check;
-- ALTER TABLE processamentos_folha ADD CONSTRAINT processamentos_folha_status_check
--   CHECK (status IN ('pendente', 'processando', 'concluido', 'erro'));
