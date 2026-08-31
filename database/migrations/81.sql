CREATE OR REPLACE FUNCTION trg_set_esocial_fechado_em()
RETURNS TRIGGER AS $$
BEGIN
    -- Dispara apenas se o status mudou para 'FECHADO'
    IF NEW.eventos_esocial_status = 'FECHADO' AND (OLD.status IS DISTINCT FROM 'FECHADO') THEN
        UPDATE processamentos_folha
        SET esocial_fechado_em = NOW()
        WHERE id = NEW.processamento_folha_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Criação da Trigger
CREATE TRIGGER trigger_atualiza_esocial_fechado
AFTER UPDATE ON eventos_esocial
FOR EACH ROW
EXECUTE FUNCTION trg_set_esocial_fechado_em();