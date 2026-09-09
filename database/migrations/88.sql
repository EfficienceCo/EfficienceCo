-- BUG-NFE-02 (Opção A) — idempotência de NF-e por tenant.
-- Troca UNIQUE global em chave_nfe por UNIQUE(cliente_id, chave_nfe),
-- permitindo dois lançamentos (entrada/saída) da mesma chave em clientes distintos.

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_chave_nfe_key;

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_cliente_chave_nfe_key;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_cliente_chave_nfe_key
  UNIQUE (cliente_id, chave_nfe);
