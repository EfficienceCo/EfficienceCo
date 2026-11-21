-- FOLHA-5 (#745): CNPJ do empregador no holerite e no relatório de fechamento.
-- Vem da coluna opcional cnpj_empresa da planilha (14 dígitos, DV válido) e fica guardado
-- junto com o cálculo, porque os PDFs são gerados depois, a partir de folha_calculos.
-- NULL = a planilha não informou; o backend tenta o cadastro do cliente (clientes.cnpj).
-- 109 (#742), 110 (#741/#744), 111 (#748) e 112 (#743) estão em PRs abertos; esta é a 113.
-- Aplicar ANTES de publicar o backend que lê/grava cnpj_empresa.
ALTER TABLE folha_calculos
  ADD COLUMN IF NOT EXISTS cnpj_empresa VARCHAR(14)
  CHECK (cnpj_empresa IS NULL OR cnpj_empresa ~ '^[0-9]{14}$');

-- Rollback (somente depois de reverter o backend que usa a coluna):
-- ALTER TABLE folha_calculos DROP COLUMN IF EXISTS cnpj_empresa;
