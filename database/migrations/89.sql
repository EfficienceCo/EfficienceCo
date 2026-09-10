-- BUG-NFE-05 (#450) — limpa arquivo_xml absolutos (prefixo de máquina Windows).
-- Mantém só o sufixo canônico: {empresa}/Notas Fiscais/{AAAA-MM}/{arquivo}.
--
-- Único formato gravado por processar_nfe desde #297 (via resolver_destino
-- "nota_fiscal"): {PASTA_BASE}/{empresa}/Notas Fiscais/{AAAA-MM}/{arquivo}.
-- Colisão de nome só altera o arquivo (stem_N.suffix); não há outros layouts.
-- 88.sql ficou com BUG-NFE-02 (#465) — UNIQUE(cliente_id, chave_nfe).

UPDATE lancamentos_fiscais
SET arquivo_xml = regexp_replace(
  replace(arquivo_xml, '\', '/'),
  '^[A-Za-z]:/.+/([^/]+/Notas Fiscais/[0-9]{4}-[0-9]{2}/[^/]+)$',
  '\1'
)
WHERE arquivo_xml ~ '^[A-Za-z]:'
  AND arquivo_xml ILIKE '%Notas Fiscais%';
