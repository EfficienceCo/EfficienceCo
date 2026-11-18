-- FOLHA-1 (#741) — categoria do funcionário em folha_calculos.
-- O holerite é gerado das linhas gravadas e precisa saber que a linha é pró-labore
-- de sócio (verba PRO-LABORE e INSS de contribuinte individual 11%). Também serve
-- ao S-1200 do eSocial. Inferir o sócio por fgts = 0 foi rejeitado (frágil).
--
-- Linhas antigas ficam 'empregado': o INSS delas já foi calculado pela tabela do
-- empregado, e o recálculo gera linha nova.
--
-- 108 está na main; a 109 está nos PRs abertos #736/#738/#739/#752. Esta é a 110.

ALTER TABLE folha_calculos
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'empregado'
  CONSTRAINT folha_calculos_categoria_check CHECK (categoria IN ('empregado', 'socio'));

-- Rollback:
-- ALTER TABLE folha_calculos DROP COLUMN IF EXISTS categoria;
