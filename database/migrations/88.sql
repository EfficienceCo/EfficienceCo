-- #440 — falha ao gerar PDF de saída da folha mantinha status "concluido" sem
-- nenhum sinal de erro visível: motivo_erro era gravado, mas a tela só renderiza
-- motivo_erro quando status === 'erro', e status não pode virar 'erro' aqui sem
-- quebrar o retry idempotente de POST /:id/gerar-saida (guard de status em
-- folha.controller.js:291 só deixa reprocessar quando status = 'concluido').
--
-- saida_status separa "cálculo concluído" (status) de "arquivos de saída
-- gerados" (saida_status), sem tocar no contrato de status existente.
ALTER TABLE processamentos_folha
  ADD COLUMN IF NOT EXISTS saida_status VARCHAR NOT NULL DEFAULT 'pendente'
  CHECK (saida_status IN ('pendente', 'ok', 'erro'));

-- Backfill: cálculo concluído com pelo menos um arquivo gerado -> a saída já tinha
-- sido gerada com sucesso antes desta coluna existir. Roda ANTES do backfill de
-- 'erro' abaixo e ignora motivo_erro de propósito: motivo_erro nunca foi limpo em
-- nenhum fluxo pré-#440 (nem calcularFolha ao suceder após um retry, nem
-- gerarSaidaFolha), então uma linha pode ter texto de uma falha antiga e não
-- relacionada (ex: cálculo falhou uma vez, foi corrigido e reprocessado com
-- sucesso) mesmo com holerites/relatórios reais no storage — a existência do
-- arquivo é sinal mais forte de sucesso do que motivo_erro estar vazio.
UPDATE processamentos_folha p
SET saida_status = 'ok'
WHERE p.status = 'concluido'
  AND (
    EXISTS (
      SELECT 1 FROM folha_calculos fc
      WHERE fc.processamento_id = p.id AND fc.holerite_path IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM folha_relatorios fr WHERE fr.processamento_id = p.id
    )
  );

-- Backfill: cálculo concluído, SEM nenhum arquivo gerado (por isso não foi pego
-- pelo UPDATE acima), com motivo_erro registrado -> exatamente o bug desta issue,
-- a geração de saída falhou e nunca foi refeita com sucesso.
UPDATE processamentos_folha
SET saida_status = 'erro'
WHERE status = 'concluido' AND motivo_erro IS NOT NULL AND saida_status <> 'ok';

-- Rollback: reverter esta migration não precisa desfazer o backfill (motivo_erro,
-- que é quem carrega informação de negócio, não é tocado) — basta remover a coluna:
--   ALTER TABLE processamentos_folha DROP COLUMN IF EXISTS saida_status;
-- Só rode o rollback depois de reverter o código do backend (folha.controller.js) que
-- lê/grava saida_status, senão os UPDATEs dele voltam a falhar por coluna inexistente.
