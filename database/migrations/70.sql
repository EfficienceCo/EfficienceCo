-- Formaliza a versão por regra e cria um contador atômico por cliente.
-- O contador no cliente é necessário para detectar também DELETE (inclusive
-- quando a regra removida não tinha a maior versão) e evitar colisões entre
-- mutações concorrentes.

ALTER TABLE public.regras
  ADD COLUMN IF NOT EXISTS versao BIGINT;

UPDATE public.regras
SET versao = 1
WHERE versao IS NULL;

ALTER TABLE public.regras
  ALTER COLUMN versao TYPE BIGINT USING versao::BIGINT,
  ALTER COLUMN versao SET DEFAULT 1,
  ALTER COLUMN versao SET NOT NULL;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS regras_versao BIGINT;

-- Na primeira aplicação, avança uma posição além do MAX legado para invalidar
-- imediatamente caches que já estavam incorretos. Em reaplicações, preserva o
-- contador existente e nunca o reduz.
WITH versoes_existentes AS (
  SELECT
    cliente.id AS cliente_id,
    cliente.regras_versao,
    MAX(regra.versao) AS maior_versao_regra
  FROM public.clientes AS cliente
  LEFT JOIN public.regras AS regra ON regra.cliente_id = cliente.id
  GROUP BY cliente.id, cliente.regras_versao
)
UPDATE public.clientes AS cliente
SET regras_versao = CASE
  WHEN versoes.regras_versao IS NULL AND versoes.maior_versao_regra IS NOT NULL
    THEN versoes.maior_versao_regra + 1
  WHEN versoes.regras_versao IS NULL
    THEN 0
  ELSE GREATEST(versoes.regras_versao, COALESCE(versoes.maior_versao_regra, 0))
END
FROM versoes_existentes AS versoes
WHERE cliente.id = versoes.cliente_id;

ALTER TABLE public.clientes
  ALTER COLUMN regras_versao SET DEFAULT 0,
  ALTER COLUMN regras_versao SET NOT NULL;

CREATE OR REPLACE FUNCTION public.versionar_mutacao_regras()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cliente_alvo UUID;
  nova_versao BIGINT;
BEGIN
  cliente_alvo := CASE WHEN TG_OP = 'DELETE' THEN OLD.cliente_id ELSE NEW.cliente_id END;

  -- Se uma regra algum dia mudar de cliente, ambos os conjuntos precisam ser
  -- invalidados. Os controllers atuais não permitem isso, mas o trigger mantém
  -- a invariável também para operações administrativas no banco.
  IF TG_OP = 'UPDATE' AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    UPDATE public.clientes
    SET regras_versao = regras_versao + 1
    WHERE id = OLD.cliente_id;
  END IF;

  UPDATE public.clientes
  SET regras_versao = regras_versao + 1
  WHERE id = cliente_alvo
  RETURNING regras_versao INTO nova_versao;

  IF nova_versao IS NULL THEN
    -- No ON DELETE CASCADE, a linha de clientes pode já ter sido removida.
    -- A exclusão da regra deve continuar; não existe mais agente para invalidar.
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION 'Cliente % não encontrado ao versionar regras', cliente_alvo;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.versao := nova_versao;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_versionar_mutacao_regras ON public.regras;

CREATE TRIGGER trigger_versionar_mutacao_regras
BEFORE INSERT OR UPDATE OR DELETE ON public.regras
FOR EACH ROW
EXECUTE FUNCTION public.versionar_mutacao_regras();
