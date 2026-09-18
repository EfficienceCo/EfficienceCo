-- BUG-FOLHA-02 (#438) — persistir a base de cálculo do IRRF em folha_calculos.
-- A base usada pelo motor considera a dedução mais vantajosa (legal ou
-- simplificada) da tabela fiscal vigente e precisa ser gravada para auditoria.
--
-- Coluna nullable (sem DEFAULT): linhas anteriores não podem ser recalculadas
-- sem reprocessar a folha e permanecem NULL de propósito.
ALTER TABLE folha_calculos ADD COLUMN IF NOT EXISTS base_ir NUMERIC(12, 2);
