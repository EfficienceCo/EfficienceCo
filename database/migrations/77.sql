
CREATE TRIGGER trigger_atualizar_eventos_esocial
  BEFORE UPDATE ON eventos_esocial
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();