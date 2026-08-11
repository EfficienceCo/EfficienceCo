-- ==========================================
-- 1. SEED DA TABELA 'CLIENTES'
-- ==========================================
-- Precisamos dos clientes primeiro por causa da chave composta (entidade fraca)
INSERT INTO clientes (id, nome, cnpj, status)
VALUES 
  ('ca81be59-428b-43e2-bfbc-e28b7dce8a0a', 'Cliente Teste Dev', '11.111.111/0001-11', 'ativo'),
  ('00000000-0000-0000-0000-000000000000', 'Efficience Interno', '00.000.000/0011-00', 'ativo')
ON CONFLICT (id) DO NOTHING;


-- ==========================================
-- 2. SEED DA TABELA 'LICENCAS'
-- ==========================================
-- 1 registro ativo por 1 ano com Token UUID fixo alinhado com o .env do agente
INSERT INTO licencas (id, cliente_id, token, ativa, validade)
VALUES (
  '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  'ca81be59-428b-43e2-bfbc-e28b7dce8a0a', -- Vinculado ao Cliente Teste Dev
  '7c9e6679-7425-40de-944b-e07fc1f90ae7', -- <-- ESTE É O TOKEN PARA O .ENV DO AGENTE
  true,
  NOW() + INTERVAL '1 year'
)
ON CONFLICT (id, cliente_id) DO NOTHING;


-- ==========================================
-- 3. SEED DA TABELA 'USUARIOS'
-- ==========================================
-- 3 registros com senhas hash Bcrypt geradas para a senha padrão 'senha123'
-- Hash usado: $2b$10$7R0Z4YwH7V9fKk8LzXmOueO0Y9B3Rk6PjZpGvWxYqZ5K2bM1R2s2C (Corresponde a 'senha123')

-- Usuário 1: admin_efficience (Administrador do sistema global)
INSERT INTO usuarios (id, cliente_id, nome, email, senha_hash, perfil)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000', -- Empresa interna
  'Admin Efficience',
  'admin.efficience@teste.com',
  '$2b$10$7R0Z4YwH7V9fKk8LzXmOueO0Y9B3Rk6PjZpGvWxYqZ5K2bM1R2s2C',
  'admin'
)
ON CONFLICT (id, cliente_id) DO NOTHING;

-- Usuário 2: admin_cliente (Administrador da empresa cliente)
INSERT INTO usuarios (id, cliente_id, nome, email, senha_hash, perfil)
VALUES (
  'b2222222-2222-2222-2222-222222222222',
  'ca81be59-428b-43e2-bfbc-e28b7dce8a0a', -- Cliente Teste Dev
  'Admin Cliente',
  'admin.cliente@teste.com',
  '$2b$10$7R0Z4YwH7V9fKk8LzXmOueO0Y9B3Rk6PjZpGvWxYqZ5K2bM1R2s2C',
  'admin'
)
ON CONFLICT (id, cliente_id) DO NOTHING;

-- Usuário 3: funcionario (Operário comum do cliente)
INSERT INTO usuarios (id, cliente_id, nome, email, senha_hash, perfil)
VALUES (
  'c3333333-3333-3333-3333-333333333333',
  'ca81be59-428b-43e2-bfbc-e28b7dce8a0a', -- Cliente Teste Dev
  'Funcionário Padrão',
  'funcionario@teste.com',
  '$2b$10$7R0Z4YwH7V9fKk8LzXmOueO0Y9B3Rk6PjZpGvWxYqZ5K2bM1R2s2C',
  'user'
)
ON CONFLICT (id, cliente_id) DO NOTHING;