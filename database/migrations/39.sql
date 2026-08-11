BEGIN;

-- ========================================================
-- 1. REMOVER A POLÍTICA RLS ANTIGA QUE BLOQUEAVA A ALTERAÇÃO
-- ========================================================

DROP POLICY IF EXISTS "Policy_Etapas_Isolamento" ON etapas;


-- ========================================================
-- 2. DESFAZER AS CHAVES COMPOSTAS E CONSTRAINTS ANTIGAS
-- ========================================================

-- Remove a FK antiga de etapas
ALTER TABLE etapas DROP CONSTRAINT IF EXISTS fk_etapas_processo;

-- Remove as PKs compostas antigas
ALTER TABLE etapas DROP CONSTRAINT IF EXISTS pk_etapas;
ALTER TABLE processos DROP CONSTRAINT IF EXISTS pk_processos;


-- ========================================================
-- 3. RESTRUTURAR AS PKs E FKs PARA 'id' SIMPLES
-- ========================================================

-- Torna 'id' a única PK de ambas as tabelas
ALTER TABLE processos ADD CONSTRAINT pk_processos PRIMARY KEY (id);
ALTER TABLE etapas ADD CONSTRAINT pk_etapas PRIMARY KEY (id);

-- Recria a FK apontando apenas para 'id' do processo
ALTER TABLE etapas 
ADD CONSTRAINT fk_etapas_processo 
FOREIGN KEY (processo_id) 
REFERENCES processos(id) 
ON DELETE CASCADE;

-- Remove a coluna redundante 'cliente_id' de etapas
ALTER TABLE etapas DROP COLUMN IF EXISTS cliente_id;


-- ========================================================
-- 4. ADICIONAR CAMPOS 'tipo' E 'acao' (Checklist)
-- ========================================================

ALTER TABLE etapas 
ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'manual';

ALTER TABLE etapas 
ADD COLUMN IF NOT EXISTS acao VARCHAR(50) NULL;

-- Restrições (CHECKs) de validação
ALTER TABLE etapas DROP CONSTRAINT IF EXISTS chk_etapas_tipo;
ALTER TABLE etapas 
ADD CONSTRAINT chk_etapas_tipo 
CHECK (tipo IN ('manual', 'automatizada'));

ALTER TABLE etapas DROP CONSTRAINT IF EXISTS chk_etapas_acao;
ALTER TABLE etapas 
ADD CONSTRAINT chk_etapas_acao 
CHECK (acao IS NULL OR acao IN ('gerar_contrato_social', 'criar_pastas'));

-- Regra: Manual tem ação NULL / Automatizada exige ação preenchida
ALTER TABLE etapas DROP CONSTRAINT IF EXISTS chk_etapas_tipo_acao_coerencia;
ALTER TABLE etapas 
ADD CONSTRAINT chk_etapas_tipo_acao_coerencia 
CHECK (
  (tipo = 'manual' AND acao IS NULL) OR 
  (tipo = 'automatizada' AND acao IS NOT NULL)
);

-- Backfill dos dados legados
UPDATE etapas SET tipo = 'manual', acao = NULL WHERE tipo IS NULL;


-- ========================================================
-- 5. RECRIAR A SUA POLÍTICA RLS (Adaptada para JWT)
-- ========================================================

ALTER TABLE etapas ENABLE ROW LEVEL SECURITY;

-- Mesma lógica que você usava, mas buscando o cliente_id a partir do processo pai
CREATE POLICY "Policy_Etapas_Isolamento" ON etapas
    FOR ALL 
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM processos p
        WHERE p.id = etapas.processo_id
          AND p.cliente_id = (auth.jwt() ->> 'cliente_id')::uuid
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM processos p
        WHERE p.id = etapas.processo_id
          AND p.cliente_id = (auth.jwt() ->> 'cliente_id')::uuid
      )
    );


-- ========================================================
-- 6. ÍNDICES DE PERFORMANCE
-- ========================================================

CREATE INDEX IF NOT EXISTS idx_processos_cliente_id ON processos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_etapas_processo_id ON etapas(processo_id);
CREATE INDEX IF NOT EXISTS idx_etapas_tipo_concluida ON etapas(tipo, concluida) WHERE concluida = FALSE;

COMMIT;