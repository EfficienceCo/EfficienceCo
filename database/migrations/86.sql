-- #377 (ES-8) — status intermediário para lock de transmissão.
-- Evita POST /transmitir concorrentes enviarem o mesmo evento duas vezes ao gov.
-- (84.sql da main já é certificados digitais CD-1.)
ALTER TABLE eventos_esocial DROP CONSTRAINT IF EXISTS eventos_esocial_status_check;
ALTER TABLE eventos_esocial
  ADD CONSTRAINT eventos_esocial_status_check
  CHECK (status IN ('rascunho','aprovado','transmitindo','transmitido','aceito','rejeitado'));
