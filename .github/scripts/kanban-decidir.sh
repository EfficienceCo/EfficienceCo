#!/usr/bin/env bash
# Decide o status de destino e os itens (issues/PRs) a mover no board, a partir do evento.
# Extraído do workflow para ser testável (ver test-kanban.sh).
# Env: EVENT, ACTION, REVIEW_STATE, PR_NUMBER, PR_DRAFT, PR_MERGED, PR_BRANCH, REF_NAME, REPO,
#      GH_TOKEN (aqui basta o `github.token`: só lê PR via API; o PROJECT_TOKEN fica só no kanban-move.sh),
#      GITHUB_OUTPUT (recebe status=, items= e branch_items=).
# Saídas separadas: items= são números que EXISTEM com certeza (o PR e as issues que ele fecha, só do repo
# atual); branch_items= é o número tirado do NOME DA BRANCH, que pode não ser issue (o kanban-move.sh só
# tolera NOT_FOUND para esses; ver TOLERANT_ITEMS).
# Falha da API (`gh pr view`) NÃO é engolida: o script sai != 0 e o job fica vermelho.
set -euo pipefail

OUT="${GITHUB_OUTPUT:-/dev/stdout}"
EVENT="${EVENT:-}"; ACTION="${ACTION:-}"; REVIEW_STATE="${REVIEW_STATE:-}"
PR_NUMBER="${PR_NUMBER:-}"; PR_DRAFT="${PR_DRAFT:-}"; PR_MERGED="${PR_MERGED:-}"
PR_BRANCH="${PR_BRANCH:-}"; REF_NAME="${REF_NAME:-}"; REPO="${REPO:-}"

status=""; items=""; branch="$REF_NAME"
case "$EVENT" in
  create)
    status="In progress" ;;
  pull_request)
    branch="$PR_BRANCH"; items="$PR_NUMBER"
    case "$ACTION" in
      opened|reopened|ready_for_review)
        if [ "$PR_DRAFT" = "true" ]; then status="In progress"; else status="Teste interno"; fi ;;
      converted_to_draft) status="In progress" ;;
      closed) if [ "$PR_MERGED" = "true" ]; then status="Done"; fi ;;
    esac ;;
  pull_request_review)
    branch="$PR_BRANCH"; items="$PR_NUMBER"
    case "$(echo "$REVIEW_STATE" | tr '[:upper:]' '[:lower:]')" in
      # PR draft aprovado continua em desenvolvimento: só vai pra fila de deploy quando sair de draft.
      approved) if [ "$PR_DRAFT" = "true" ]; then status="In progress"; else status="Fila de deploy"; fi ;;
      changes_requested) status="In progress" ;;
    esac ;;
esac

if [ -z "$status" ]; then
  echo "Evento sem transição, nada a fazer"
  echo "status=" >> "$OUT"
  exit 0
fi

# Certos: o PR + issues que ele fecha. closingIssuesReferences pode trazer issue de outro repositório:
# só entram as do repo atual (comparação case-insensitive de owner/name).
if [ -n "$PR_NUMBER" ]; then
  closing_json=$(gh pr view "$PR_NUMBER" -R "$REPO" --json closingIssuesReferences)
  closing=$(jq -r --arg r "$REPO" '.closingIssuesReferences[]|select(((.repository.owner.login+"/"+.repository.name)|ascii_downcase)==($r|ascii_downcase))|.number' <<<"$closing_json")
  items="$items $closing"
fi
# shellcheck disable=SC2086
items=$(printf '%s
' $items | awk 'NF && !s[$0]++' | paste -sd' ' -)

# Tolerante: <numero>-... da branch, se não já estiver entre os certos.
branch_items=""
num="${branch%%-*}"
if [[ "$num" =~ ^[0-9]+$ ]]; then
  case " $items " in *" $num "*) ;; *) branch_items="$num" ;; esac
fi
{ echo "status=$status"; echo "items=$items"; echo "branch_items=$branch_items"; } >> "$OUT"
echo "Destino: $status | itens: $items | itens da branch (tolerantes): $branch_items"
