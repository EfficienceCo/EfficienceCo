CREATE OR REPLACE FUNCTION gerenciar_contador_usuarios()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE clientes SET total_usuarios = total_usuarios + 1 WHERE id = NEW.cliente_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE clientes SET total_usuarios = total_usuarios - 1 WHERE id = OLD.cliente_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger que dispara a função acima
CREATE TRIGGER tr_atualizar_total_usuarios
AFTER INSERT OR DELETE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION gerenciar_contador_usuarios();