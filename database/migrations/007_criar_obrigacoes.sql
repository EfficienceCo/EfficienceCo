-- Migration 007: Criar tabela de obrigacoes fiscais e contabeis
CREATE TABLE IF NOT EXISTS obrigacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id),
  nome VARCHAR NOT NULL,
  tipo VARCHAR CHECK (tipo IN ('mensal', 'anual', 'eventual')) NOT NULL,
  data_vencimento DATE NOT NULL,
  recorrente BOOLEAN DEFAULT FALSE,
  status VARCHAR CHECK (status IN ('pendente', 'concluida', 'atrasada')) DEFAULT 'pendente',
  criado_em TIMESTAMP DEFAULT NOW()
);
