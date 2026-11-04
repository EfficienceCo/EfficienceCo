-- 107 — #691 (BUG-CONC-14), revisão do PR #712: um lançamento só pode estar em um par ativo.
--
-- A consulta preventiva do backend (criarConciliacao) e a conferência do concluir não fecham a
-- corrida de duas conciliações criadas ao mesmo tempo: as duas leem o lançamento como livre e
-- as duas gravam o par. Este índice move a garantia para o banco: o segundo INSERT falha com
-- 23505 e o backend responde 409.
--
-- "Par ativo" = automático ou provável (sem_par não segura o lançamento; ao rejeitar um provável
-- o lançamento sai do par original, ver 105). Vale para conciliações em andamento e concluídas:
-- o par continua existindo depois de concluir, então um lançamento já conciliado também não
-- entra em outro par.
--
-- Só vale para pares criados a partir desta migration (criado_em): o dev já tinha lançamentos
-- em mais de um par ativo, restos do próprio bug (11 lançamentos, 49 pares, em 2026-11-02), e
-- um índice sobre tudo não seria criado. Esses pares antigos ficam fora do índice; limpar à
-- parte, se for preciso. O predicado precisa ser constante (índice parcial), por isso a data fixa.
-- Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS uq_pares_conciliacao_lancamento_ativo
  ON public.pares_conciliacao (lancamento_id)
  WHERE lancamento_id IS NOT NULL
    AND confianca IN ('automatico', 'provavel')
    AND criado_em >= TIMESTAMPTZ '2026-11-02 00:00:00-03';

-- Rollback: DROP INDEX IF EXISTS public.uq_pares_conciliacao_lancamento_ativo;
-- (o backend da #691 trata a violação como 409; sem o índice volta a valer só a checagem em código).
