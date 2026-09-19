-- #440: separa cálculo concluído de geração dos PDFs; preserva o retry de saída.
-- 88.sql pertence à NF-e; 91.sql está reservada em PRs abertos.
-- Aplicar ANTES de publicar o backend que lê/grava saida_status.
ALTER TABLE processamentos_folha
  ADD COLUMN IF NOT EXISTS saida_status VARCHAR NOT NULL DEFAULT 'pendente'
  CHECK (saida_status IN ('pendente', 'ok', 'erro'));

-- Sucesso legado exige TODOS os holerites e um relatório para CADA empresa.
-- Arquivos completos prevalecem sobre motivo_erro antigo de cálculo já recuperado.
-- Só classifica pendentes: replay não sobrescreve estados operacionais ok/erro.
UPDATE processamentos_folha p
SET saida_status = 'ok'
WHERE p.status = 'concluido' AND p.saida_status = 'pendente'
  AND EXISTS (
    SELECT 1 FROM folha_calculos fc WHERE fc.processamento_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM folha_calculos fc
    WHERE fc.processamento_id = p.id
      AND (
        fc.holerite_path IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM folha_relatorios fr
          WHERE fr.processamento_id = p.id AND fr.empresa = fc.empresa
        )
      )
  );

-- Falha total ou parcial continua visível e oferece retry na UI.
UPDATE processamentos_folha
SET saida_status = 'erro'
WHERE status = 'concluido' AND motivo_erro IS NOT NULL AND saida_status = 'pendente';

-- Rollback (somente depois de reverter o backend que usa a coluna):
-- ALTER TABLE processamentos_folha DROP COLUMN IF EXISTS saida_status;
-- motivo_erro e os arquivos existentes não são alterados por esta migration.
