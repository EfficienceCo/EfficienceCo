-- 105 — #690 (BUG-CONC-13), revisão do PR #711: decisão do par e totais numa transação só.
--
-- Na 104 o backend gravava a decisão e depois chamava recalcular_totais_conciliacao em outra
-- chamada; se o recálculo falhava, a decisão ficava gravada sem os totais e o "desfazer" feito
-- pelo backend era outra chamada, sujeita a falhar ou colidir com uma confirmação paralela.
-- Agora cada decisão é uma function: se qualquer passo falhar, o Postgres desfaz tudo.
--
-- confirmar_par_conciliacao: UPDATE condicional (só par provável ainda sem decisão) e recálculo.
--   Duas confirmações paralelas de pares diferentes: o recálculo da segunda espera o lock da
--   conciliação (da 104), então roda depois do commit da primeira e conta os dois pares.
-- rejeitar_par_conciliacao: trava o par (FOR UPDATE; ao liberar, a condição é reavaliada, então
--   confirmar × rejeitar do mesmo par deixa só um passar), vira 'sem_par' só da transação e cria
--   o 'sem_par' só do lançamento. Totais não mudam: a transação continua pendente.
-- Ambas devolvem NULL/false quando o par não está mais disponível (o backend responde 409).
-- SECURITY INVOKER: o RLS de quem chama continua valendo. search_path fixo, como na 100/104.
-- Idempotente.

CREATE OR REPLACE FUNCTION public.confirmar_par_conciliacao(
  p_conciliacao_id uuid,
  p_par_id uuid,
  p_usuario_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.pares_conciliacao
  SET confirmado_por = p_usuario_id,
      confirmado_em = now()
  WHERE id = p_par_id
    AND conciliacao_id = p_conciliacao_id
    AND confianca = 'provavel'
    AND confirmado_em IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM public.recalcular_totais_conciliacao(p_conciliacao_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.rejeitar_par_conciliacao(
  p_conciliacao_id uuid,
  p_par_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lancamento_id uuid;
  v_par_lancamento_id uuid;
BEGIN
  SELECT lancamento_id INTO v_lancamento_id
  FROM public.pares_conciliacao
  WHERE id = p_par_id
    AND conciliacao_id = p_conciliacao_id
    AND confianca = 'provavel'
    AND confirmado_em IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.pares_conciliacao
  SET lancamento_id = NULL,
      confianca = 'sem_par'
  WHERE id = p_par_id;

  INSERT INTO public.pares_conciliacao (conciliacao_id, transacao_id, lancamento_id, confianca)
  VALUES (p_conciliacao_id, NULL, v_lancamento_id, 'sem_par')
  RETURNING id INTO v_par_lancamento_id;

  RETURN v_par_lancamento_id;
END;
$$;

-- Rollback: DROP FUNCTION public.confirmar_par_conciliacao(uuid, uuid, uuid);
--           DROP FUNCTION public.rejeitar_par_conciliacao(uuid, uuid);
-- (o backend da #690 passa a depender delas; reverter junto com o código).
