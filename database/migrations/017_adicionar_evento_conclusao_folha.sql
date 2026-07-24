-- Migration 017: Flag de evento de conclusão da folha (idempotência)
-- Evita duplicar eventos/notificações quando POST .../gerar-saida é reexecutado.
ALTER TABLE processamentos_folha
  ADD COLUMN IF NOT EXISTS evento_conclusao_registrado BOOLEAN NOT NULL DEFAULT FALSE;
