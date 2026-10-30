-- #695 — quem enviou o extrato.
-- lancamentos_contabeis e conciliacoes já tinham criado_por (migration 67).
-- extratos_bancarios não tinha a coluna. Nullable: extratos já gravados
-- não têm autor conhecido, e o backend passa a preencher só nos novos.

ALTER TABLE extratos_bancarios
  ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES usuarios(id);

-- Rollback:
-- ALTER TABLE extratos_bancarios DROP COLUMN IF EXISTS criado_por;
