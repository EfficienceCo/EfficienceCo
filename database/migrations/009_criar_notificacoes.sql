-- Migration 009: Criar tabela de notificacoes internas
CREATE TABLE IF NOT EXISTS notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id),
  tipo VARCHAR CHECK (tipo IN ('obrigacao_vencendo', 'processo_atrasado', 'arquivo_recebido')) NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMP DEFAULT NOW()
);
