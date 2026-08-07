SELECT 
  t.relname AS tabela,
  c.conname AS nome_constraint,
  pg_get_constraintdef(c.oid) AS definicao
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE c.contype = 'p' 
  AND t.relname IN ('licencas', 'eventos', 'regras');