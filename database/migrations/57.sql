CREATE TABLE lancamentos_fiscais (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  chave_nfe       VARCHAR(44) NOT NULL UNIQUE,
  tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  cnpj_emitente   VARCHAR(14) NOT NULL,
  cnpj_destinatario VARCHAR(14) NOT NULL,
  valor_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  icms            NUMERIC(14,2) NOT NULL DEFAULT 0,
  pis             NUMERIC(14,2) NOT NULL DEFAULT 0,
  cofins          NUMERIC(14,2) NOT NULL DEFAULT 0,
  ipi             NUMERIC(14,2) NOT NULL DEFAULT 0,
  data_emissao    DATE NOT NULL,
  arquivo_xml     TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lancamentos_fiscais_cliente_id ON lancamentos_fiscais(cliente_id);
CREATE INDEX idx_lancamentos_fiscais_data_emissao ON lancamentos_fiscais(cliente_id, data_emissao);