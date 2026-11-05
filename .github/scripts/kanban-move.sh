#!/usr/bin/env bash
# Move itens (issues/PRs) no board "Esqueleto Efficience" (org project nº 2).
# Uso: kanban-move.sh "<Status>" <numero> [<numero>...]
# Env: GH_TOKEN (= secret PROJECT_TOKEN), REPO (owner/name), ORG, PROJECT_NUMBER
#
# O PROJECT_TOKEN precisa (repo privado: além do Project, este script lê issue/PR via GraphQL):
#   - PAT classic:      escopos `project` + `repo`
#   - PAT fine-grained: acesso ao repositório (Metadata: read, Pull requests: read, Issues: read)
#                       + permissão da organização "Projects: read and write"
#   - Organização com SAML SSO: o PAT (classic ou fine-grained) precisa ser AUTORIZADO para a org
#     (Settings > Developer settings > Tokens > "Configure SSO" > Authorize); sem isso a API responde como se
#     os recursos não existissem.
#   - Fine-grained: o "Resource owner" tem que ser a ORGANIZAÇÃO (não a conta pessoal), senão o token não
#     enxerga o Project nem o repo da org.
#   Ref.: https://github.github.com/gh-aw/reference/auth-projects/#personal-access-tokens
#
# Env opcional: TOLERANT_ITEMS = números (separados por espaço) que vieram só do NOME DA BRANCH e podem não
# ser issue/PR. Só para eles NOT_FOUND vira ::warning:: e segue. Para os demais (número do PR, issues que o
# PR fecha: existem com certeza) NOT_FOUND = PROJECT_TOKEN sem acesso ao repo => ::error:: e exit 1.
# NOT_FOUND ("Could not resolve to an issue or pull request") só vale para issue/PR. Token só com `project`
# num repo privado faz o REPOSITÓRIO virar nulo ("Could not resolve to a Repository") e PAT sem SAML autorizado
# responde 403: esses e os demais erros de API (auth, rede, rate limit, 5xx) falham o script (exit 1) com a
# mensagem original da API + a orientação do token.
set -euo pipefail

STATUS="$1"; shift
ORG="${ORG:-EfficienceCo}"
PROJECT_NUMBER="${PROJECT_NUMBER:-2}"
OWNER="${REPO%%/*}"; NAME="${REPO##*/}"

fail_token() { echo "::error::$1"; echo "Confira o PROJECT_TOKEN: acesso ao repo $REPO e ao Project nº $PROJECT_NUMBER de $ORG; em org com SAML SSO o PAT precisa estar autorizado para a org; no fine-grained o Resource owner tem que ser a org."; exit 1; }

errf=$(mktemp); trap 'rm -f "$errf"' EXIT
if ! meta=$(gh api graphql -f query='
  query($org:String!,$n:Int!){ organization(login:$org){ projectV2(number:$n){
    id field(name:"Status"){ ... on ProjectV2SingleSelectField { id options{ id name } } } } } }' \
  -f org="$ORG" -F n="$PROJECT_NUMBER" 2>"$errf"); then
  echo "$meta"; cat "$errf"
  fail_token "Falha ao consultar o Project nº $PROJECT_NUMBER de $ORG (token inválido/sem acesso, rede ou rate limit?)"
fi
project_id=$(jq -r '.data.organization.projectV2.id // empty' <<<"$meta")
[ -n "$project_id" ] || fail_token "Project nº $PROJECT_NUMBER de $ORG inacessível (projectV2 nulo: PROJECT_TOKEN sem permissão de Projects?)"
field_id=$(jq -r '.data.organization.projectV2.field.id // empty' <<<"$meta")
[ -n "$field_id" ] || fail_token "Campo 'Status' não encontrado no Project nº $PROJECT_NUMBER"
option_id=$(jq -r --arg s "$STATUS" '.data.organization.projectV2.field.options[]?|select(.name==$s)|.id' <<<"$meta")
[ -n "$option_id" ] || { echo "::error::Status '$STATUS' não existe no board"; exit 1; }

TOLERANT_ITEMS="${TOLERANT_ITEMS:-}"
is_tolerant() { local t; for t in $TOLERANT_ITEMS; do [ "$t" = "$1" ] && return 0; done; return 1; }
# NOT_FOUND: tolerável só para número derivado da branch; senão é token sem acesso ao repo.
not_found() { # not_found <num> -> warning (tolerável) ou ::error:: + exit 1
  if is_tolerant "$1"; then
    echo "::warning::#$1: não é issue/PR existente (número derivado do nome da branch?), ignorando"
    notfound=$((notfound+1)); return 0
  fi
  fail_token "#$1: issue/PR existe mas não foi encontrada (NOT_FOUND): PROJECT_TOKEN sem acesso ao repo $REPO?"
}

notfound=0; total=$#; handled=0
for num in "$@"; do
  : > "$errf"
  if node_raw=$(gh api graphql -f query='
    query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issueOrPullRequest(number:$n){
      ... on Issue { id projectItems(first:20){ nodes{ id project{ id } fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } } } } }
      ... on PullRequest { id projectItems(first:20){ nodes{ id project{ id } fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } } }' \
    -f o="$OWNER" -f r="$NAME" -F n="$num" 2>"$errf"); then
    node=$(jq -c '.data.repository.issueOrPullRequest' <<<"$node_raw")
  else
    api_err="$node_raw
$(cat "$errf")"
    if [[ "$api_err" == *"Could not resolve to an issue or pull request"* ]]; then
      not_found "$num"; continue
    fi
    # Erro genérico (inclui "Could not resolve to a Repository" = token sem acesso ao repo privado, e 403 de
    # PAT sem SAML autorizado): preserva a mensagem original da API e acrescenta a orientação do token.
    echo "$api_err"
    first_line=$(grep -m1 -vE '^[[:space:]]*([{}[]|$)' <<<"$api_err" || true)  # 1ª linha que não é vazia nem JSON cru
    fail_token "#$num: falha na API do GitHub (token sem acesso ao repo/SAML não autorizado, auth, rede, rate limit ou 5xx?): ${first_line:-sem detalhe}"
  fi
  if [ -z "$node" ] || [ "$node" = "null" ]; then
    not_found "$num"; continue
  fi

  content_id=$(jq -r '.id' <<<"$node")
  item_id=$(jq -r --arg p "$project_id" '.projectItems.nodes[]|select(.project.id==$p)|.id' <<<"$node" | head -n1)
  current=$(jq -r --arg p "$project_id" '.projectItems.nodes[]|select(.project.id==$p)|.fieldValueByName.name // ""' <<<"$node" | head -n1)

  if [ -z "$item_id" ]; then
    : > "$errf"
    if ! item_id=$(gh api graphql -f query='
      mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p,contentId:$c}){ item{ id } } }'       -f p="$project_id" -f c="$content_id" --jq '.data.addProjectV2ItemById.item.id' 2>"$errf"); then
      echo "$item_id"; cat "$errf"
      fail_token "#$num: falha ao adicionar o card ao Project (token sem permissão de escrita no Project?): $(head -n1 "$errf")"
    fi
  fi

  # Done é terminal: eventos tardios (review depois do merge etc.) não reabrem o card.
  if [ "$current" = "Done" ] && [ "$STATUS" != "Done" ]; then
    echo "#$num: já está em Done, mantendo"; handled=$((handled+1)); continue
  fi
  if [ "$current" = "$STATUS" ]; then echo "#$num: já está em $STATUS"; handled=$((handled+1)); continue; fi

  : > "$errf"
  if ! upd_out=$(gh api graphql -f query='
    mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{
      projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }'     -f p="$project_id" -f i="$item_id" -f f="$field_id" -f o="$option_id" 2>"$errf"); then
    echo "$upd_out"; cat "$errf"
    fail_token "#$num: falha ao mover o card para '$STATUS' (token sem permissão de escrita no Project?): $(head -n1 "$errf")"
  fi
  echo "#$num: ${current:-sem status} -> $STATUS"; handled=$((handled+1))
done

if [ "$handled" -eq 0 ]; then
  echo "::warning::nenhum card movido nem já no destino ($notfound de $total itens não encontrados)"
fi
