CREATE TABLE tipos_documento (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    slug character varying(50) NOT NULL UNIQUE, -- Identificador amigável para o ML e Backend (ex: 'contrato_social', 'holerite')
    nome character varying(100) NOT NULL,        -- Label para exibição no Dropdown do Frontend
    descricao text,                              -- Contexto adicional/instruções para rotulagem do ML
    ativo boolean DEFAULT true,                  -- Permite desativar sem excluir historicamente
    criado_em timestamp with time zone DEFAULT now(),
    CONSTRAINT tipos_documento_pkey PRIMARY KEY (id)
);

-- 2. Índices de performance para consultas frequentes
CREATE INDEX idx_tipos_documento_slug ON tipos_documento(slug);
CREATE INDEX idx_tipos_documento_ativo ON tipos_documento(ativo) WHERE ativo = true;

-- 3. Habilita Row Level Security
ALTER TABLE tipos_documento ENABLE ROW LEVEL SECURITY;