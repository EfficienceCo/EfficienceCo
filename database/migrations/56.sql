-- Migration 020: Normalizar CNPJ em clientes (somente dígitos) para lookup indexado
UPDATE clientes
SET cnpj = regexp_replace(cnpj, '[^0-9]', '', 'g')
WHERE cnpj IS NOT NULL
  AND cnpj ~ '[^0-9]';
