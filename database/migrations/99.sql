-- QA-F G1: data de início de atividade do cliente.
-- Usada pela apuração do Simples para proporcionalizar a RBT12 nos primeiros
-- 12 meses de atividade (Res. CGSN 140/2018 art. 22). NULL = não informado
-- (comportamento anterior: janela fixa de 12 meses).
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS data_inicio_atividade DATE;

COMMENT ON COLUMN clientes.data_inicio_atividade IS
  'Data de início da atividade da empresa (abertura). NULL = não informada.';

-- Rollback (somente se nenhum valor tiver sido informado):
-- ALTER TABLE clientes DROP COLUMN IF EXISTS data_inicio_atividade;
