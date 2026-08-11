BEGIN;



-- Correção da tabela notificacoes
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS pk_notificacoes;
ALTER TABLE notificacoes ADD CONSTRAINT pk_notificacoes PRIMARY KEY (id);

COMMIT;