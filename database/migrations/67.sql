-- Conciliação bancária: 5 tabelas

CREATE TABLE lancamentos_contabeis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data_lancamento DATE NOT NULL,
  valor           NUMERIC(15,2) NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('credito', 'debito')),
  descricao       TEXT NOT NULL,
  categoria       TEXT,
  conciliado      BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por      UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_lancamentos_contabeis_cliente ON lancamentos_contabeis(cliente_id);
CREATE INDEX idx_lancamentos_contabeis_data    ON lancamentos_contabeis(cliente_id, data_lancamento);

-- ---

CREATE TABLE extratos_bancarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  banco          TEXT NOT NULL,
  conta          TEXT,
  mes            INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano            INTEGER NOT NULL,
  arquivo_nome   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'processado', 'erro')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em  TIMESTAMPTZ
);

CREATE INDEX idx_extratos_bancarios_cliente ON extratos_bancarios(cliente_id);
CREATE INDEX idx_extratos_bancarios_periodo ON extratos_bancarios(cliente_id, ano, mes);

-- ---

CREATE TABLE transacoes_extrato (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extrato_id       UUID NOT NULL REFERENCES extratos_bancarios(id) ON DELETE CASCADE,
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  data_lancamento  DATE NOT NULL,
  valor            NUMERIC(15,2) NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('credito', 'debito')),
  descricao        TEXT,
  id_banco         TEXT,
  conciliado       BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transacoes_extrato_extrato ON transacoes_extrato(extrato_id);
CREATE INDEX idx_transacoes_extrato_cliente ON transacoes_extrato(cliente_id);

-- ---

CREATE TABLE conciliacoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  extrato_id        UUID NOT NULL REFERENCES extratos_bancarios(id),
  mes               INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano               INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida')),
  total_transacoes  INTEGER NOT NULL DEFAULT 0,
  total_conciliadas INTEGER NOT NULL DEFAULT 0,
  total_pendentes   INTEGER NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_em      TIMESTAMPTZ,
  criado_por        UUID REFERENCES usuarios(id)
);

CREATE INDEX idx_conciliacoes_cliente ON conciliacoes(cliente_id);
CREATE INDEX idx_conciliacoes_periodo ON conciliacoes(cliente_id, ano, mes);

-- ---

CREATE TABLE pares_conciliacao (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conciliacao_id  UUID NOT NULL REFERENCES conciliacoes(id) ON DELETE CASCADE,
  transacao_id    UUID REFERENCES transacoes_extrato(id),
  lancamento_id   UUID REFERENCES lancamentos_contabeis(id),
  confianca       TEXT NOT NULL CHECK (confianca IN ('automatico', 'provavel', 'sem_par')),
  confirmado_por  UUID REFERENCES usuarios(id),
  confirmado_em   TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pares_conciliacao_conciliacao ON pares_conciliacao(conciliacao_id);
CREATE INDEX idx_pares_conciliacao_confianca   ON pares_conciliacao(conciliacao_id, confianca);