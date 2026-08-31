-- #376 (ES-7) — fluxo do evento eSocial: rascunho -> aprovado -> download

-- 1. Guardar o formulário do wizard junto do rascunho. A aprovação do S-2200
--    acontece depois da criação e precisa desses dados para materializar o
--    registro em `funcionarios` (ES-5). Também serve de trilha de auditoria e
--    permite regerar o XML sem o front reenviar tudo.
ALTER TABLE eventos_esocial ADD COLUMN IF NOT EXISTS dados_formulario JSONB;

-- 2. Pré-requisito de cliente novo (Decisão 6 da reunião): antes do 1º evento
--    de um cliente, exigir sinal de que o eSocial já está configurado no
--    Grupo 1. Sem Grupo 1 nesta sprint, o contador marca manualmente na 1ª vez.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS esocial_configurado BOOLEAN NOT NULL DEFAULT false;

-- 3. Índices para a timeline da tela (histórico por cliente e por funcionário).
CREATE INDEX IF NOT EXISTS idx_eventos_esocial_cliente_criado
  ON eventos_esocial (cliente_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_esocial_funcionario
  ON eventos_esocial (funcionario_id);
