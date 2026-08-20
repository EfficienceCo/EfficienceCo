-- Resultados mensais da apuração tributária (AP-1 / #350).
CREATE TABLE IF NOT EXISTS public.apuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  periodo_mes INTEGER NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
  periodo_ano INTEGER NOT NULL CHECK (periodo_ano >= 2020),
  regime TEXT NOT NULL CHECK (regime IN ('simples_nacional', 'lucro_presumido')),
  rbt12_usado NUMERIC(15,2) NOT NULL,
  receita_mes NUMERIC(15,2) NOT NULL,
  anexo TEXT CHECK (anexo IN ('I', 'II', 'III', 'IV', 'V')),
  fator_r NUMERIC(5,4),
  folha12 NUMERIC(15,2),
  aliquota_efetiva NUMERIC(5,4) NOT NULL,
  valor_calculado NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'aprovado')),
  valor_editado NUMERIC(15,2),
  historico_edicoes JSONB DEFAULT '[]'::jsonb,
  aprovado_por TEXT,
  aprovado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, periodo_mes, periodo_ano, regime)
);

-- CREATE TABLE IF NOT EXISTS não corrige uma tabela preexistente. Garante que
-- o requisito central de unicidade também exista nesse cenário.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = 'public.apuracoes'::regclass
      AND constraint_record.contype = 'u'
      AND ARRAY(
        SELECT attribute.attname::TEXT
        FROM unnest(constraint_record.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = constraint_record.conrelid
         AND attribute.attnum = key_column.attnum
        ORDER BY key_column.ordinality
      ) = ARRAY['cliente_id', 'periodo_mes', 'periodo_ano', 'regime']
  ) THEN
    ALTER TABLE public.apuracoes
      ADD CONSTRAINT apuracoes_cliente_periodo_regime_unique
      UNIQUE (cliente_id, periodo_mes, periodo_ano, regime);
  END IF;
END;
$$;

ALTER TABLE public.apuracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apuracoes_service_role ON public.apuracoes;
CREATE POLICY apuracoes_service_role
  ON public.apuracoes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS trigger_atualizar_apuracoes ON public.apuracoes;
CREATE TRIGGER trigger_atualizar_apuracoes
  BEFORE UPDATE ON public.apuracoes
  FOR EACH ROW
  EXECUTE FUNCTION public.atualizar_timestamp();
