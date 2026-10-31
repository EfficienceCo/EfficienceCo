-- 103 — #690 (BUG-CONC-13): totais da conciliação recalculados a partir dos pares.
--
-- Antes, confirmar um par lia total_conciliadas/total_pendentes e gravava +1/-1; duas
-- ações simultâneas perdiam uma contagem. Agora o backend chama esta function depois de
-- cada decisão. O FOR UPDATE serializa quem chama, e o UPDATE seguinte (outro statement,
-- novo snapshot em READ COMMITTED) enxerga todos os pares já gravados, então o último a
-- rodar sempre grava o valor certo.
--
-- Mesma regra de criarConciliacao (conciliacoes.controller.js):
--   conciliadas = automáticos + prováveis confirmados
--   pendentes   = prováveis ainda sem decisão + transações sem par
--   (sem_par só de lançamento, sem transação, fica fora da conta)
-- SECURITY INVOKER: o RLS de quem chama continua valendo. search_path fixo, como na 100.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.recalcular_totais_conciliacao(p_conciliacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.conciliacoes WHERE id = p_conciliacao_id FOR UPDATE;

  UPDATE public.conciliacoes c
  SET total_conciliadas = (
        SELECT count(*) FROM public.pares_conciliacao p
        WHERE p.conciliacao_id = c.id
          AND (p.confianca = 'automatico'
               OR (p.confianca = 'provavel' AND p.confirmado_em IS NOT NULL))
      ),
      total_pendentes = (
        SELECT count(*) FROM public.pares_conciliacao p
        WHERE p.conciliacao_id = c.id
          AND ((p.confianca = 'provavel' AND p.confirmado_em IS NULL)
               OR (p.confianca = 'sem_par' AND p.transacao_id IS NOT NULL))
      )
  WHERE c.id = p_conciliacao_id;
END;
$$;

-- Rollback: DROP FUNCTION public.recalcular_totais_conciliacao(uuid);
-- (o backend da #690 passa a depender dela; reverter junto com o código).
