-- QA-F: preserve the precision used by the calculation (including Fator R >= 10).
-- NUMERIC without typmod keeps the decimal sent by the API without a fiscal cap.
ALTER TABLE apuracoes ALTER COLUMN fator_r TYPE NUMERIC;
ALTER TABLE apuracoes ALTER COLUMN aliquota_efetiva TYPE NUMERIC;

-- Rollback (only after checking for fator_r >= 10 and accepting rate rounding):
-- ALTER TABLE apuracoes ALTER COLUMN fator_r TYPE NUMERIC(5,4);
-- ALTER TABLE apuracoes ALTER COLUMN aliquota_efetiva TYPE NUMERIC(5,4);
-- No rows or columns are removed. Rates already rounded before this migration
-- are reconstructed from the persisted calculation inputs by the read API.
