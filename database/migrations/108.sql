-- #695 — quem enviou o extrato.
-- lancamentos_contabeis e conciliacoes já tinham criado_por (migration 67).
-- extratos_bancarios não tinha a coluna. Nullable: extratos já gravados
-- não têm autor conhecido, e o backend passa a preencher só nos novos.
--
-- 102 e 103 estão na main (NFE-5 e SEG-1). 104–107 estão em PRs abertos
-- (#690, #692, #691). Esta é a 108.

ALTER TABLE extratos_bancarios
  ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES usuarios(id);

-- Rollback:
-- ALTER TABLE extratos_bancarios DROP COLUMN IF EXISTS criado_por;
