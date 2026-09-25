-- BUG-NFE-08 (#568) — o banco também é fronteira de confiança.
--
-- numeric(14,2) ARREDONDA casa extra no cast (10.999 vira 11.00) antes de
-- qualquer CHECK, então a coluna não consegue recusar esse caso. Aqui os
-- cinco valores passam a numeric sem escala forçada; a CHECK exige a faixa
-- de negócio (0 … 999999999999.99) e no máximo 2 casas. A API continua
-- rejeitando antes, com mensagem por campo (lancamento-fiscal.util.js).
--
-- NOT VALID: não revarre linhas já gravadas (a bateria de QA chegou a
-- persistir lixo). INSERT e UPDATE seguintes são recusados.

ALTER TABLE lancamentos_fiscais
  ALTER COLUMN valor_total TYPE numeric,
  ALTER COLUMN icms TYPE numeric,
  ALTER COLUMN pis TYPE numeric,
  ALTER COLUMN cofins TYPE numeric,
  ALTER COLUMN ipi TYPE numeric;

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_chave_nfe_digitos_check;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_chave_nfe_digitos_check
  CHECK (chave_nfe ~ '^[0-9]{44}$')
  NOT VALID;

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_cnpj_emitente_digitos_check;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_cnpj_emitente_digitos_check
  CHECK (cnpj_emitente ~ '^[0-9]{14}$')
  NOT VALID;

-- Destinatário pode ser CNPJ (14) ou CPF (11) — venda a pessoa física (#566).
ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_documento_destinatario_check;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_documento_destinatario_check
  CHECK (cnpj_destinatario ~ '^[0-9]{11}$' OR cnpj_destinatario ~ '^[0-9]{14}$')
  NOT VALID;

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_valores_faixa_check;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_valores_faixa_check
  CHECK (
    valor_total >= 0 AND valor_total <= 999999999999.99 AND scale(valor_total) <= 2
    AND icms >= 0 AND icms <= 999999999999.99 AND scale(icms) <= 2
    AND pis >= 0 AND pis <= 999999999999.99 AND scale(pis) <= 2
    AND cofins >= 0 AND cofins <= 999999999999.99 AND scale(cofins) <= 2
    AND ipi >= 0 AND ipi <= 999999999999.99 AND scale(ipi) <= 2
  )
  NOT VALID;

-- Caminho absoluto (disco Windows, UNC ou POSIX) e segmento "..".
ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_arquivo_xml_relativo_check;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_arquivo_xml_relativo_check
  CHECK (
    arquivo_xml IS NULL
    OR (
      arquivo_xml !~ '^[A-Za-z]:'
      AND left(replace(arquivo_xml, '\', '/'), 1) <> '/'
      AND replace(arquivo_xml, '\', '/') !~ '(^|/)\.\.(/|$)'
    )
  )
  NOT VALID;

-- Rollback:
-- ALTER TABLE lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_arquivo_xml_relativo_check;
-- ALTER TABLE lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_valores_faixa_check;
-- ALTER TABLE lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_documento_destinatario_check;
-- ALTER TABLE lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_cnpj_emitente_digitos_check;
-- ALTER TABLE lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_chave_nfe_digitos_check;
-- ALTER TABLE lancamentos_fiscais
--   ALTER COLUMN valor_total TYPE numeric(14,2),
--   ALTER COLUMN icms TYPE numeric(14,2),
--   ALTER COLUMN pis TYPE numeric(14,2),
--   ALTER COLUMN cofins TYPE numeric(14,2),
--   ALTER COLUMN ipi TYPE numeric(14,2);
