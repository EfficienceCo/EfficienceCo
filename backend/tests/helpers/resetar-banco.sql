-- Infraestrutura de teste: o preparador copia este SQL somente para o Supabase
-- descartável. Este arquivo não faz parte de database/migrations.
CREATE OR REPLACE FUNCTION public.__teste_679_resetar_banco()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  tabelas text;
BEGIN
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
    INTO tabelas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
     AND NOT c.relispartition
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid AND d.deptype = 'e'
     );
  IF tabelas IS NOT NULL THEN
    -- RESTRICT recusa FKs de tabelas que não estão na lista; não usa CASCADE.
    EXECUTE 'TRUNCATE TABLE ' || tabelas || ' RESTART IDENTITY RESTRICT';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.__teste_679_resetar_banco() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__teste_679_resetar_banco() TO service_role;
