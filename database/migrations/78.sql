
CREATE TRIGGER trigger_atualizar_funcionarios
  BEFORE UPDATE ON funcionarios
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();