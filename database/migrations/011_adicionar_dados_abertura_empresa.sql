ALTER TABLE processos ADD COLUMN cenario VARCHAR CHECK (cenario IN ('nova', 'cliente_existente'));
ALTER TABLE processos ADD COLUMN socios JSONB;
ALTER TABLE processos ADD COLUMN capital_social NUMERIC;
ALTER TABLE processos ADD COLUMN endereco TEXT;
ALTER TABLE processos ADD COLUMN objeto_social TEXT;
