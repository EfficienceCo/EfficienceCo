#!/usr/bin/env bash
# Move itens (issues/PRs) no board "Esqueleto Efficience" (org project nº 2).
# Uso: kanban-move.sh "<Status>" <numero> [<numero>...]
# Env: GH_TOKEN (PAT com escopo `project`), REPO (owner/name), ORG, PROJECT_NUMBER
set -euo pipefail

STATUS="$1"; shift
ORG="${ORG:-EfficienceCo}"
PROJECT_NUMBER="${PROJECT_NUMBER:-2}"
OWNER="${REPO%%/*}"; NAME="${REPO##*/}"

meta=$(gh api graphql -f query='
  query($org:String!,$n:Int!){ organization(login:$org){ projectV2(number:$n){
    id field(name:"Status"){ ... on ProjectV2SingleSelectField { id options{ id name } } } } } }' \
  -f org="$ORG" -F n="$PROJECT_NUMBER")
project_id=$(jq -r '.data.organization.projectV2.id' <<<"$meta")
field_id=$(jq -r '.data.organization.projectV2.field.id' <<<"$meta")
option_id=$(jq -r --arg s "$STATUS" '.data.organization.projectV2.field.options[]|select(.name==$s)|.id' <<<"$meta")
[ -n "$option_id" ] || { echo "Status '$STATUS' não existe no board"; exit 1; }

for num in "$@"; do
  node=$(gh api graphql -f query='
    query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issueOrPullRequest(number:$n){
      ... on Issue { id projectItems(first:20){ nodes{ id project{ id } fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } } } } }
      ... on PullRequest { id projectItems(first:20){ nodes{ id project{ id } fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } } }' \
    -f o="$OWNER" -f r="$NAME" -F n="$num" --jq '.data.repository.issueOrPullRequest' 2>/dev/null || true)
  [ -n "$node" ] && [ "$node" != "null" ] || { echo "#$num: não encontrado, ignorando"; continue; }

  content_id=$(jq -r '.id' <<<"$node")
  item_id=$(jq -r --arg p "$project_id" '.projectItems.nodes[]|select(.project.id==$p)|.id' <<<"$node" | head -n1)
  current=$(jq -r --arg p "$project_id" '.projectItems.nodes[]|select(.project.id==$p)|.fieldValueByName.name // ""' <<<"$node" | head -n1)

  if [ -z "$item_id" ]; then
    item_id=$(gh api graphql -f query='
      mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p,contentId:$c}){ item{ id } } }' \
      -f p="$project_id" -f c="$content_id" --jq '.data.addProjectV2ItemById.item.id')
  fi

  # Done é terminal: eventos tardios (review depois do merge etc.) não reabrem o card.
  if [ "$current" = "Done" ] && [ "$STATUS" != "Done" ]; then
    echo "#$num: já está em Done, mantendo"; continue
  fi
  if [ "$current" = "$STATUS" ]; then echo "#$num: já está em $STATUS"; continue; fi

  gh api graphql -f query='
    mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{
      projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }' \
    -f p="$project_id" -f i="$item_id" -f f="$field_id" -f o="$option_id" >/dev/null
  echo "#$num: ${current:-sem status} -> $STATUS"
done
