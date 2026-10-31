-- 102 — SEG-1 (#666): RLS único por cliente_id + perfil, lido do token do usuário.
-- Decisão: vault decisoes/2026-10-26-seg-1-rls-identidade-por-requisicao.md
--
-- O backend passa a falar com o banco com um JWT curto assinado com o segredo do
-- Supabase (claims: role=authenticated, sub, cliente_id, perfil). Estas policies
-- substituem as antigas (dois padrões + várias USING (true)). service_role continua
-- ignorando o RLS (login, jobs e agente local, ver backend/src/config/database.js).
-- Idempotente. APLICAR NO DEV SÓ DEPOIS de conferir o estado real das policies (#664).

CREATE OR REPLACE FUNCTION public.rls_cliente_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'cliente_id', '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.rls_perfil() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() ->> 'perfil'
$$;

CREATE OR REPLACE FUNCTION public.rls_eh_staff() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.rls_perfil() = 'admin_efficience'
$$;

-- Só admin_cliente e staff escrevem; 'funcionario' só lê (exceção: notificacoes).
CREATE OR REPLACE FUNCTION public.rls_pode_escrever() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.rls_perfil() IN ('admin_cliente', 'admin_efficience')
$$;

-- Tabelas com coluna cliente_id: derruba TODAS as policies atuais e cria o padrão.
DO $$
DECLARE
  t record;
  p record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'cliente_id'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t.table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t.table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY rls_leitura ON public.%I FOR SELECT TO authenticated
         USING (public.rls_eh_staff() OR cliente_id = public.rls_cliente_id())',
      t.table_name);
    EXECUTE format(
      'CREATE POLICY rls_escrita ON public.%I FOR ALL TO authenticated
         USING (public.rls_pode_escrever()
                AND (public.rls_eh_staff() OR cliente_id = public.rls_cliente_id()))
         WITH CHECK (public.rls_pode_escrever()
                AND (public.rls_eh_staff() OR cliente_id = public.rls_cliente_id()))',
      t.table_name);
  END LOOP;
END $$;

-- notificacoes: qualquer perfil do escritório marca como lida.
DROP POLICY IF EXISTS rls_escrita ON public.notificacoes;
CREATE POLICY rls_escrita ON public.notificacoes FOR ALL TO authenticated
  USING (public.rls_eh_staff() OR cliente_id = public.rls_cliente_id())
  WITH CHECK (public.rls_eh_staff() OR cliente_id = public.rls_cliente_id());

-- clientes: a própria linha é o escritório.
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clientes'
  LOOP EXECUTE format('DROP POLICY %I ON public.clientes', p.policyname); END LOOP;
END $$;
CREATE POLICY rls_leitura ON public.clientes FOR SELECT TO authenticated
  USING (public.rls_eh_staff() OR id = public.rls_cliente_id());
CREATE POLICY rls_escrita ON public.clientes FOR ALL TO authenticated
  USING (public.rls_pode_escrever() AND (public.rls_eh_staff() OR id = public.rls_cliente_id()))
  WITH CHECK (public.rls_pode_escrever() AND (public.rls_eh_staff() OR id = public.rls_cliente_id()));

-- Tabelas filhas sem cliente_id: herdam do pai.
DO $$
DECLARE
  f record;
  p record;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('etapas',            'processo_id',       'processos'),
    ('pares_conciliacao', 'conciliacao_id',    'conciliacoes'),
    ('folha_calculos',    'processamento_id',  'processamentos_folha'),
    ('folha_relatorios',  'processamento_id',  'processamentos_folha')
  ) AS v(filha, fk, pai)
  LOOP
    IF to_regclass('public.' || f.filha) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', f.filha);
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = f.filha
    LOOP EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, f.filha); END LOOP;

    EXECUTE format(
      'CREATE POLICY rls_leitura ON public.%I FOR SELECT TO authenticated
         USING (public.rls_eh_staff() OR EXISTS (
           SELECT 1 FROM public.%I pai
           WHERE pai.id = %I.%I AND pai.cliente_id = public.rls_cliente_id()))',
      f.filha, f.pai, f.filha, f.fk);
    EXECUTE format(
      'CREATE POLICY rls_escrita ON public.%I FOR ALL TO authenticated
         USING (public.rls_pode_escrever() AND (public.rls_eh_staff() OR EXISTS (
           SELECT 1 FROM public.%I pai
           WHERE pai.id = %I.%I AND pai.cliente_id = public.rls_cliente_id())))
         WITH CHECK (public.rls_pode_escrever() AND (public.rls_eh_staff() OR EXISTS (
           SELECT 1 FROM public.%I pai
           WHERE pai.id = %I.%I AND pai.cliente_id = public.rls_cliente_id())))',
      f.filha, f.pai, f.filha, f.fk, f.pai, f.filha, f.fk);
  END LOOP;
END $$;

-- tipos_documento: catálogo global, só leitura.
ALTER TABLE public.tipos_documento ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tipos_documento'
  LOOP EXECUTE format('DROP POLICY %I ON public.tipos_documento', p.policyname); END LOOP;
END $$;
CREATE POLICY rls_leitura ON public.tipos_documento FOR SELECT TO authenticated USING (true);
-- NFE-5 (#659) — emitente pode ser CNPJ (14) ou CPF (11), produtor rural PF.
-- Espelho do destinatário (#566) na migration 96. O dígito verificador fica
-- na API (cpfValido / cnpjValido), para não duplicar o algoritmo em SQL.
--
-- 101 é da NFE-9 (#663). Esta é a 102.
-- NOT VALID: não revarre linhas já gravadas. INSERT e UPDATE seguintes
-- são recusados. Banco em modo manutenção: Vinícius aplica no Supabase de dev.

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_cnpj_emitente_digitos_check;

ALTER TABLE lancamentos_fiscais
  DROP CONSTRAINT IF EXISTS lancamentos_fiscais_documento_emitente_check;

ALTER TABLE lancamentos_fiscais
  ADD CONSTRAINT lancamentos_fiscais_documento_emitente_check
  CHECK (cnpj_emitente ~ '^[0-9]{11}$' OR cnpj_emitente ~ '^[0-9]{14}$')
  NOT VALID;

-- Rollback:
-- ALTER TABLE lancamentos_fiscais DROP CONSTRAINT IF EXISTS lancamentos_fiscais_documento_emitente_check;
-- ALTER TABLE lancamentos_fiscais
--   ADD CONSTRAINT lancamentos_fiscais_cnpj_emitente_digitos_check
--   CHECK (cnpj_emitente ~ '^[0-9]{14}$')
--   NOT VALID;
