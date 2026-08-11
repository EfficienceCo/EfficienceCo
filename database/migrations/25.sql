ALTER TABLE regras 
ALTER COLUMN condicao TYPE JSONB 
USING CASE 
    WHEN condicao IS NULL OR TRIM(condicao) = '' THEN NULL 
    ELSE condicao::jsonb 
END;