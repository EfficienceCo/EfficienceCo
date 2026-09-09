-- BUG-NFE-05 (#450) — limpa arquivo_xml absolutos (prefixo de máquina Windows).
-- Mantém só o sufixo canônico: {empresa}/Notas Fiscais/{AAAA-MM}/{arquivo}.

UPDATE lancamentos_fiscais
SET arquivo_xml = regexp_replace(
  replace(arquivo_xml, '\', '/'),
  '^[A-Za-z]:/.+/([^/]+/Notas Fiscais/[0-9]{4}-[0-9]{2}/[^/]+)$',
  '\1'
)
WHERE arquivo_xml ~ '^[A-Za-z]:'
  AND arquivo_xml ILIKE '%Notas Fiscais%';
