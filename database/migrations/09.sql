ALTER TABLE clientes 
RENAME COLUMN criado_em TO data_vinculo;

ALTER TABLE regras
RENAME COLUMN criado_em TO data_vinculo;

ALTER TABLE licencas
RENAME COLUMN criado_em TO data_vinculo;

ALTER TABLE usuarios
RENAME COLUMN criado_em TO data_vinculo;

ALTER TABLE eventos 
RENAME COLUMN criado_em TO data_vinculo;