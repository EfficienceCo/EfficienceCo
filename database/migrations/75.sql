CREATE TABLE IF NOT EXISTS eventos_esocial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  funcionario_id UUID REFERENCES funcionarios(id),
  tipo_evento TEXT NOT NULL,
  xml_gerado TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovado','transmitido','aceito','rejeitado')),
  numero_recibo TEXT,
  erro_rejeicao TEXT,
  aprovado_por TEXT,
  aprovado_em TIMESTAMPTZ,
  data_envio TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE eventos_esocial ENABLE ROW LEVEL SECURITY;
CREATE POLICY eventos_esocial_service_role ON eventos_esocial TO service_role USING (true) WITH CHECK (true);