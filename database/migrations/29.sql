ALTER TABLE processos
  ADD COLUMN mes_referencia DATE;

COMMENT ON COLUMN processos.mes_referencia IS 'Mês de referência (YYYY-MM-01). Preenchido apenas em processos do tipo folha_pagamento gerados automaticamente.';