-- BUG-FOLHA-02 (#438) — persistir a base de cálculo do IRRF em folha_calculos.
-- calcularFolhaFuncionario já calcula base_ir (base_calculo - INSS - dependentes),
-- mas o valor nunca era retornado nem gravado, então o holerite não tinha como
-- exibir "BASE IRRF" e o imposto retido ficava sem trilha de auditoria.
--
-- Coluna nullable (sem DEFAULT): linhas de folha_calculos anteriores a esta
-- migration não têm o valor e não dá pra recalcular sem reprocessar a planilha —
-- ficam NULL de propósito. Inserts novos sempre trazem base_ir
-- (folha.controller espalha o retorno de calcularFolhaFuncionario direto no insert).
ALTER TABLE folha_calculos ADD COLUMN IF NOT EXISTS base_ir NUMERIC(12, 2);
