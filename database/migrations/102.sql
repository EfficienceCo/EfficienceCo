-- NFE-5 (#659) — emitente pode ser CNPJ (14) ou CPF (11), produtor rural PF.
-- Espelho do destinatário (#566) na migration 96. O dígito verificador fica
-- na API (cpfValido / cnpjValido), para não duplicar o algoritmo em SQL.
--
-- 101 é da NFE-9 (#663). Esta é a 102.
-- NOT VALID: não revarre linhas já gravadas. INSERT e UPDATE seguintes
-- são recusados. Banco em modo manutenção: Vinícius aplica no Supabase de dev.

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_cnpj_emitente_digitos_check;

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_documento_emitente_check;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_documento_emitente_check
  CHECK (cnpj_emitente ~ '^[0-9]{11}$' OR cnpj_emitente ~ '^[0-9]{14}$')
  NOT VALID;

-- Rollback:
-- ALTER TABLE lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_documento_emitente_check;
-- ALTER TABLE lancamentos_fiscais
--   ADD CONSTRAINT lancamentos_fiscais_cnpj_emitente_digitos_check
--   CHECK (cnpj_emitente ~ '^[0-9]{14}$')
--   NOT VALID;
