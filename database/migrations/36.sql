ALTER TABLE clientes 
RENAME COLUMN data_vinculo TO criado_em;

ALTER TABLE regras
RENAME COLUMN data_vinculo TO criado_em;

ALTER TABLE licencas
RENAME COLUMN data_vinculo TO criado_em;

ALTER TABLE usuarios
RENAME COLUMN data_vinculo TO criado_em;

ALTER TABLE eventos 
RENAME COLUMN data_vinculo TO criado_em;