# Catálogo NCM

Códigos de 8 dígitos vigentes da Nomenclatura Comum do Mercosul (Siscomex Classif).
Só a existência do código; sem descrição, alíquota ou EX.

Fonte: `https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json`

Como atualizar:

1. Baixar o JSON oficial.
2. Manter `Codigo` com 8 dígitos (pontos removidos) e `Data_Fim` vazia ou `31/12/9999`.
3. Trocar `codigos` em `ncm-tipi.json` e as datas `snapshot` / `atualizacao_ncm`.
