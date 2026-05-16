CREATE TABLE processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  tipo VARCHAR NOT NULL CHECK (tipo IN ('folha_pagamento', 'abertura_empresa')),
  status VARCHAR NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT FALSE,
  ordem INTEGER NOT NULL,
  concluida_em TIMESTAMPTZ
);
